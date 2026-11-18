import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

async function getAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "").trim();
  }

  if (!token) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/auth_token=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  if (!token) return null;

  const { data } = await supabaseAdmin.auth.getUser(token);
  return data?.user || null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(request);

    const { data: document, error } = await supabaseAdmin
      .from("documents")
      .select("id, file_name, total_pages, extracted_text, pages, user_id")
      .eq("id", id)
      .single();

    if (error || !document) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 },
      );
    }

    // Per-user security check: if document has an owner, only that owner can view it
    if (document.user_id && user && document.user_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to view this document." },
        { status: 403 },
      );
    }

    if (!document.extracted_text) {
      return NextResponse.json(
        {
          error:
            "Extracted text is not available. Please upload the PDF again.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        fileName: document.file_name,
        totalPages: document.total_pages,
        text: document.extracted_text,
        pages: document.pages ?? [],
      },
    });
  } catch (error) {
    console.error("Document content API error:", error);

    return NextResponse.json(
      { error: "Unable to retrieve document content." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser(request);

    // 1. Find the document in Supabase
    const { data: document, error: fetchError } = await supabaseAdmin
      .from("documents")
      .select("id, storage_path, file_name, user_id")
      .eq("id", id)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 },
      );
    }

    // Per-user security check: if document belongs to a user, check permission
    if (document.user_id && user && document.user_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied. You do not have permission to delete this document." },
        { status: 403 },
      );
    }

    // 2. Delete the PDF from Supabase Storage
    const { error: storageError } = await supabaseAdmin.storage
      .from("documents")
      .remove([document.storage_path]);

    if (storageError) {
      console.error("PDF storage deletion failed:", storageError.message);

      return NextResponse.json(
        { error: "Unable to delete the PDF from storage." },
        { status: 500 },
      );
    }

    // 3. Delete the document record from the database
    const { error: databaseError } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", id);

    if (databaseError) {
      console.error(
        "Document database deletion failed:",
        databaseError.message,
      );

      return NextResponse.json(
        {
          error:
            "PDF was removed from storage, but its database record could not be deleted.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully.",
      documentId: id,
    });
  } catch (error) {
    console.error("Document deletion API error:", error);

    return NextResponse.json(
      { error: "Something went wrong while deleting the document." },
      { status: 500 },
    );
  }
}
