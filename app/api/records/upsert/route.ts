import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items: any[] = Array.isArray(body) ? body : body.items || [];
    if (!Array.isArray(items) || items.length === 0)
      return NextResponse.json({ error: "No items provided" }, { status: 400 });

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

    // Generate embeddings for each item (full JSON) and upsert with embedding.
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY)
      return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

    // prepare inputs as JSON strings of the whole object
    const inputs = items.map((it) => JSON.stringify(it));

    // chunk helper
    const chunk = <T,>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    const BATCH_SIZE = 50;
    const batches = chunk(inputs, BATCH_SIZE);
    const embeddings: number[][] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model: "text-embedding-3-small", input: batch }),
      });

      if (!res.ok) {
        const txt = await res.text();
        return NextResponse.json({ error: `Embedding error (batch ${i}): ${txt}` }, { status: 500 });
      }

      const json = await res.json();
      const batchEmb = (json.data || []).map((d: any) => d.embedding || []);
      embeddings.push(...batchEmb);

      if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 200));
    }

    if (embeddings.length !== items.length)
      return NextResponse.json({ error: "Embedding count mismatch" }, { status: 500 });

    // attach embeddings to items
    const rowsToUpsert = items.map((it, idx) => ({
      ...it,
      embedding: embeddings[idx] ?? null,
    }));

    const { data, error } = await supabase.from("records").upsert(rowsToUpsert, { onConflict: "product_ref" }).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, records: data || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
