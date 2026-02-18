import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

// Types for API responses
type SessionSummary = {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  /** First user message in session (by created_at), for deriving title */
  first_user_message?: string;
  first_created_at?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

/**
 * GET /api/chat-sessions
 * - Without session_id: List all sessions for the user (for sidebar)
 * - With session_id: Get messages for a specific session
 * 
 * Query params:
 * - user_id: Required
 * - session_id: Optional - if provided, returns messages for that session
 * - limit: Optional - number of sessions/messages to return (default: 20)
 * - offset: Optional - for pagination
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = user.id;

    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get("session_id");
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const supabase = getSupabaseAdmin();

    if (session_id) {
      // Get messages for a specific session
      const { data: messages, error } = await supabase
        .from("conversations")
        .select("id, user_message, assistant_message, created_at")
        .eq("user_id", user_id)
        .eq("session_id", session_id)
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching messages:", error);
        return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
      }

      // Transform paired messages into separate user/assistant messages
      const transformedMessages: Message[] = [];
      for (const row of messages || []) {
        if (row.user_message) {
          transformedMessages.push({
            id: `${row.id}-user`,
            role: "user",
            content: row.user_message,
            created_at: row.created_at,
          });
        }
        if (row.assistant_message) {
          transformedMessages.push({
            id: `${row.id}-assistant`,
            role: "assistant",
            content: row.assistant_message,
            created_at: row.created_at,
          });
        }
      }

      return NextResponse.json({ messages: transformedMessages });
    } else {
      // List all sessions for the user (for sidebar)
      const { data: sessions, error } = await supabase
        .from("conversations")
        .select("session_id, title, created_at, updated_at, user_message")
        .eq("user_id", user_id)
        .not("session_id", "is", null)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching sessions:", error);
        return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
      }

      const sessionMap = new Map<string, SessionSummary>();
      const DEFAULT_TITLES = new Set(["Menopause Support Chat", "New chat", ""]);

      for (const row of sessions || []) {
        if (!row.session_id) continue;

        if (!sessionMap.has(row.session_id)) {
          sessionMap.set(row.session_id, {
            session_id: row.session_id,
            title: row.title ?? "",
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at,
            message_count: 1,
            first_user_message: row.user_message?.trim() || undefined,
            first_created_at: row.created_at,
          });
        } else {
          const existing = sessionMap.get(row.session_id)!;
          existing.message_count++;
          if (new Date(row.created_at) < new Date(existing.created_at)) {
            existing.created_at = row.created_at;
            existing.first_created_at = row.created_at;
            existing.first_user_message =
              row.user_message?.trim() || existing.first_user_message;
          }
          if (row.updated_at && new Date(row.updated_at) > new Date(existing.updated_at)) {
            existing.updated_at = row.updated_at;
          }
        }
      }

      const maxTitleLen = 48;
      const sessionList = Array.from(sessionMap.values())
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(offset, offset + limit)
        .map((s) => {
          let title = s.title?.trim() || "";
          if (!title || DEFAULT_TITLES.has(title)) {
            const first = (s.first_user_message || "").trim();
            title =
              first.length <= maxTitleLen ? first : first.slice(0, maxTitleLen).trim() + "…";
          }
          if (!title) title = "Chat";
          return {
            session_id: s.session_id,
            title,
            created_at: s.created_at,
            updated_at: s.updated_at,
            message_count: s.message_count,
          };
        });

      return NextResponse.json({ sessions: sessionList });
    }
  } catch (error) {
    console.error("Error in chat-sessions GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/chat-sessions
 * Create a new chat session or update session title
 * 
 * Body:
 * - user_id: Required
 * - session_id: Required
 * - title: Optional - title for the session
 * - action: Optional - "create" (default) or "update_title"
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = user.id;

    const body = await request.json();
    const { session_id, title, action = "create" } = body;

    if (!session_id) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (action === "update_title") {
      // Update title for all messages in the session
      const { error } = await supabase
        .from("conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("user_id", user_id)
        .eq("session_id", session_id);

      if (error) {
        console.error("Error updating session title:", error);
        return NextResponse.json({ error: "Failed to update session title" }, { status: 500 });
      }

      return NextResponse.json({ success: true, session_id, title });
    }

    // For "create", we just return success - the actual session is created
    // when the first message is stored via langchain-rag
    return NextResponse.json({ 
      success: true, 
      session_id,
      title: title || "Menopause Support Chat"
    });
  } catch (error) {
    console.error("Error in chat-sessions POST:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat-sessions
 * Delete a chat session and all its messages
 * 
 * Query params:
 * - user_id: Required
 * - session_id: Required
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user_id = user.id;

    const { searchParams } = new URL(request.url);
    const session_id = searchParams.get("session_id");

    if (!session_id) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("user_id", user_id)
      .eq("session_id", session_id);

    if (error) {
      console.error("Error deleting session:", error);
      return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted_session_id: session_id });
  } catch (error) {
    console.error("Error in chat-sessions DELETE:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
