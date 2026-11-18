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

// GET: Retrieve all chat sessions for the user or active session messages
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (sessionId) {
      // Fetch messages for a specific session
      try {
        const { data: session } = await supabaseAdmin
          .from("chat_sessions")
          .select("*")
          .eq("id", sessionId)
          .single();

        if (session && session.user_id && user && session.user_id !== user.id) {
          return NextResponse.json({ error: "Access denied." }, { status: 403 });
        }

        const { data: messages, error } = await supabaseAdmin
          .from("chat_messages")
          .select("id, role, content, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });

        if (error) {
          return NextResponse.json({ success: true, messages: [] });
        }

        return NextResponse.json({
          success: true,
          session,
          messages: messages || [],
        });
      } catch (err) {
        console.warn("chat_messages table not ready, returning empty:", err);
        return NextResponse.json({ success: true, messages: [] });
      }
    }

    // Otherwise list recent sessions
    try {
      let query = supabaseAdmin
        .from("chat_sessions")
        .select("id, title, document_ids, updated_at, created_at")
        .order("updated_at", { ascending: false });

      if (user) {
        query = query.or(`user_id.eq.${user.id},user_id.is.null`);
      }

      const { data: sessions, error } = await query.limit(20);

      if (error) {
        return NextResponse.json({ success: true, sessions: [] });
      }

      return NextResponse.json({
        success: true,
        sessions: sessions || [],
      });
    } catch {
      return NextResponse.json({ success: true, sessions: [] });
    }
  } catch (error) {
    console.error("Chat history GET error:", error);
    return NextResponse.json({ success: true, sessions: [], messages: [] });
  }
}

// POST: Create a session or append a message to chat history
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await request.json();
    const { action, sessionId, title, documentIds, role, content } = body;

    if (action === "create_session") {
      try {
        const { data: session, error } = await supabaseAdmin
          .from("chat_sessions")
          .insert({
            user_id: user?.id || null,
            title: title || "New Document Chat",
            document_ids: documentIds || [],
          })
          .select()
          .single();

        if (error) {
          return NextResponse.json(
            { error: error.message || "Failed to create chat session." },
            { status: 500 },
          );
        }

        return NextResponse.json({ success: true, session });
      } catch (err) {
        return NextResponse.json(
          { error: "Database table chat_sessions not yet configured." },
          { status: 500 },
        );
      }
    }

    if (action === "save_message") {
      if (!sessionId || !role || !content) {
        return NextResponse.json(
          { error: "Missing required fields (sessionId, role, content)." },
          { status: 400 },
        );
      }

      try {
        const { data: message, error } = await supabaseAdmin
          .from("chat_messages")
          .insert({
            session_id: sessionId,
            role,
            content,
          })
          .select()
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Touch updated_at on the session
        await supabaseAdmin
          .from("chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId);

        return NextResponse.json({ success: true, message });
      } catch (err) {
        return NextResponse.json(
          { error: "Unable to save message to chat history." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("Chat history POST error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// DELETE: Delete a chat session
export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required." },
        { status: 400 },
      );
    }

    const { data: session } = await supabaseAdmin
      .from("chat_sessions")
      .select("id, user_id")
      .eq("id", sessionId)
      .single();

    if (session && session.user_id && user && session.user_id !== user.id) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    await supabaseAdmin.from("chat_sessions").delete().eq("id", sessionId);

    return NextResponse.json({ success: true, message: "Chat session deleted." });
  } catch (error) {
    console.error("Chat session DELETE error:", error);
    return NextResponse.json(
      { error: "Unable to delete chat session." },
      { status: 500 },
    );
  }
}
