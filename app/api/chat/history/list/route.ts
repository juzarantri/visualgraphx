import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      return NextResponse.json(
        {
          error:
            "Supabase env not set (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)",
        },
        { status: 500 }
      );

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // return a list of sessions with basic metadata (compute message_count in JS)
    const { data, error } = await supabase
      .from("user_chats")
      .select("id, session_id, metadata, created_at, updated_at, chats")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const sessions = (data ?? []).map((r: any) => ({
      id: r.id,
      session_id: r.session_id,
      metadata: r.metadata,
      created_at: r.created_at,
      updated_at: r.updated_at,
      message_count: Array.isArray(r.chats) ? r.chats.length : 0,
    }));
    return NextResponse.json({ sessions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
