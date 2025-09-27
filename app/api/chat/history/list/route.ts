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

    const url = new URL(req.url);
    const qp = url.searchParams;
    const page = Math.max(1, parseInt(qp.get("page") || "1", 10));
    const page_size = Math.max(1, parseInt(qp.get("page_size") || "20", 10));
    const q = qp.get("q") || undefined;
    const date_from = qp.get("date_from") || undefined;
    const date_to = qp.get("date_to") || undefined;

    // build base query with select that returns count
    let query = supabase
      .from("user_chats")
      .select("id, session_id, metadata, created_at, updated_at, chats", {
        count: "exact",
      });

    if (q) {
      // search by session_id
      query = query.ilike("session_id", `%${q}%`);
    }
    if (date_from) {
      query = query.gte("created_at", date_from);
    }
    if (date_to) {
      query = query.lte("created_at", date_to);
    }

    const offset = (page - 1) * page_size;
    const rangeFrom = offset;
    const rangeTo = offset + page_size - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(rangeFrom, rangeTo);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const total = typeof count === "number" ? count : (data ?? []).length;
    const sessions = (data ?? []).map((r: any) => ({
      id: r.id,
      session_id: r.session_id,
      metadata: r.metadata,
      created_at: r.created_at,
      updated_at: r.updated_at,
      message_count: Array.isArray(r.chats) ? r.chats.length : 0,
    }));

    const has_more = page * page_size < total;

    return NextResponse.json({
      sessions,
      meta: {
        total,
        page,
        page_size,
        has_more,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
