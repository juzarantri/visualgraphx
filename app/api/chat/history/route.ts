import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      session_id?: string;
      chats?: ChatMessage[];
    };
    const session_id = body.session_id;
    const chats = body.chats;
    if (!session_id)
      return NextResponse.json(
        { error: "session_id required" },
        { status: 400 }
      );
    if (!Array.isArray(chats))
      return NextResponse.json(
        { error: "chats array required" },
        { status: 400 }
      );

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

    // Use the service role key for trusted server-side writes. Keep this key server-only and do not expose it.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Normalize timestamps in chats to UTC ISO strings so DB stores universal times
    const normalize = (c: any) => {
      // only preserve known fields and coerce timestamp fields to ISO UTC when valid
      const out: any = {
        role: c.role,
        content: c.content,
      };
      if (c.sent_at) {
        const d = new Date(c.sent_at);
        if (!Number.isNaN(d.getTime())) out.sent_at = d.toISOString();
      }
      if (c.received_at) {
        const d = new Date(c.received_at);
        if (!Number.isNaN(d.getTime())) out.received_at = d.toISOString();
      }
      return out;
    };

    const safeChats = Array.isArray(chats) ? chats.map(normalize) : chats;

    // upsert session — ensure your Supabase table has permissive insert/update policies for anon key,
    // or configure Row Level Security to allow this operation from your server-origin.
    const { data, error } = await supabase
      .from("user_chats")
      .upsert({ session_id, chats: safeChats }, { onConflict: "session_id" })
      .select();
    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          hint: "If this is a permissions error, check Supabase RLS/policies for `user_chats`.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, record: data?.[0] ?? null });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
