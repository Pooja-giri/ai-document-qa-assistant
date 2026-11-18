import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Find the document using its database ID.
    const { data: document, error: documentError } = await supabaseAdmin
      .from("documents")
      .select("id, file_name, storage_path")
      .eq("id", id)
      .single();

    if (documentError || !document) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 },
      );
    }

    // Generate a temporary URL valid for 5 minutes.
    const { data, error: signedUrlError } = await supabaseAdmin.storage
      .from("documents")
      .createSignedUrl(document.storage_path, 300);

    if (signedUrlError || !data?.signedUrl) {
      console.error("Signed URL generation failed:", signedUrlError?.message);

      return NextResponse.json(
        { error: "Unable to generate PDF preview URL." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      fileName: document.file_name,
      signedUrl: data.signedUrl,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("PDF preview API error:", error);

    return NextResponse.json(
      { error: "Something went wrong while opening the PDF." },
      { status: 500 },
    );
  }
}
