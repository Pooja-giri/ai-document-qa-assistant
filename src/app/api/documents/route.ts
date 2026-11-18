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

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);

    // Per-user document ownership: If user is logged in, show their documents + unassigned guest documents
    // If column user_id is not yet added in database, gracefully fallback to all documents
    if (user) {
      try {
        const { data, error } = await supabaseAdmin
          .from("documents")
          .select("id, file_name, storage_path, file_size, total_pages, created_at, user_id")
          .or(`user_id.eq.${user.id},user_id.is.null`)
          .order("created_at", { ascending: false });

        if (!error && data) {
          return NextResponse.json({
            success: true,
            totalDocuments: data.length,
            documents: data,
          });
        }
      } catch (fallbackErr) {
        console.warn("Could not query with user_id, falling back:", fallbackErr);
      }
    }

    // Default query without user_id filter if column doesn't exist or unauthenticated
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("id, file_name, storage_path, file_size, total_pages, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Document retrieval error:", error.message);
      return NextResponse.json(
        { error: "Unable to retrieve saved documents." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      totalDocuments: data.length,
      documents: data,
    });
  } catch (error) {
    console.error("Documents API error:", error);
    return NextResponse.json(
      { error: "Something went wrong while retrieving saved documents." },
      { status: 500 },
    );
  }
}
