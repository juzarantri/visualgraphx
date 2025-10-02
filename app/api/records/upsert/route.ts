// ============================================
// /api/records/upsert/route.ts
// ============================================

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
        { error: "Supabase env not set" },
        { status: 500 }
      );

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY)
      return NextResponse.json(
        { error: "OPENAI_API_KEY not set" },
        { status: 500 }
      );

    // Generate embeddings for products (title + description + technical_data)
    const productInputs = items.map((it) => {
      const parts = [
        it.title || "",
        it.description || "",
        it.technical_data || "",
      ]
        .filter(Boolean)
        .join(" ");
      return parts;
    });

    const chunk = <T>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
      return out;
    };

    const BATCH_SIZE = 50;
    const batches = chunk(productInputs, BATCH_SIZE);
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
        return NextResponse.json(
          { error: `Embedding error (batch ${i}): ${txt}` },
          { status: 500 }
        );
      }

      const json = await res.json();
      const batchEmb = (json.data || []).map((d: any) => d.embedding || []);
      embeddings.push(...batchEmb);

      if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 200));
    }

    if (embeddings.length !== items.length)
      return NextResponse.json(
        { error: "Embedding count mismatch" },
        { status: 500 }
      );

    // Upsert products
    const rowsToUpsert = items.map((it, idx) => ({
      product_ref: it.product_ref,
      title: it.title ?? null,
      description: it.description ?? null,
      price: it.price ?? null,
      url: it.url ?? null,
      image_url: it.image_url ?? null,
      metadata: it.metadata ?? {},
      faq: it.faq ?? [],
      technical_data: it.technical_data ?? "",
      embedding: embeddings[idx] ?? null,
    }));

    const { data, error } = await supabase
      .from("records")
      .upsert(rowsToUpsert, { onConflict: "product_ref" })
      .select();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    let faq_upserted = 0;

    // Handle FAQs - delete existing and insert new ones
    for (const item of items) {
      const faqs = item.faq || [];
      if (Array.isArray(faqs) && faqs.length > 0) {
        // Delete existing FAQs for this product
        await supabase
          .from("product_faqs")
          .delete()
          .eq("product_ref", item.product_ref);

        // Prepare FAQs for insertion
        const faqsToInsert: any[] = [];
        const faqInputs: string[] = [];

        for (const faq of faqs) {
          if (faq.q && faq.a) {
            faqsToInsert.push({
              product_ref: item.product_ref,
              question: faq.q,
              answer: faq.a,
            });
            faqInputs.push(`${faq.q} ${faq.a}`);
          }
        }

        // Generate embeddings for FAQs
        if (faqInputs.length > 0) {
          const faqBatches = chunk(faqInputs, BATCH_SIZE);
          const faqEmbeddings: number[][] = [];

          for (let i = 0; i < faqBatches.length; i++) {
            const batch = faqBatches[i];
            const embRes = await fetch("https://api.openai.com/v1/embeddings", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: "text-embedding-3-small",
                input: batch,
              }),
            });

            if (!embRes.ok) {
              console.error("FAQ embedding failed, skipping");
              break;
            }

            const embJson = await embRes.json();
            const batchEmb = (embJson.data || []).map(
              (d: any) => d.embedding || []
            );
            faqEmbeddings.push(...batchEmb);

            if (i < faqBatches.length - 1)
              await new Promise((res) => setTimeout(res, 200));
          }

          // Insert FAQs with embeddings
          if (faqEmbeddings.length === faqsToInsert.length) {
            const faqRows = faqsToInsert.map((faq, idx) => ({
              ...faq,
              embedding: faqEmbeddings[idx],
            }));

            const { error: faqErr } = await supabase
              .from("product_faqs")
              .insert(faqRows);

            if (!faqErr) {
              faq_upserted += faqRows.length;
            }
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      records: data || [],
      faq_upserted,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
