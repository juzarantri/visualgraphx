// ============================================
// /api/datasets/upload/route.ts
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

    const refs = items
      .map((it) => (it && it.product_ref ? String(it.product_ref).trim() : ""))
      .filter(Boolean);

    if (refs.length === 0)
      return NextResponse.json(
        { error: "No product_ref values found" },
        { status: 400 }
      );

    const { data, error } = await supabase
      .from("records")
      .select("product_ref")
      .in("product_ref", refs);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const existing = new Set((data || []).map((r: any) => r.product_ref));
    const duplicates = items.filter((it) => existing.has(it.product_ref));
    const news = items.filter((it) => !existing.has(it.product_ref));

    let inserted = 0;
    let inserted_refs: string[] = [];
    let faq_inserted = 0;

    if (news.length > 0) {
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (!OPENAI_API_KEY)
        return NextResponse.json(
          { error: "OPENAI_API_KEY not set" },
          { status: 500 }
        );

      // Generate embeddings for products (title + description + technical_data)
      const productInputs = news.map((it) => {
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
      const inputBatches = chunk(productInputs, BATCH_SIZE);
      const embeddings: number[][] = [];

      // Get product embeddings
      for (let i = 0; i < inputBatches.length; i++) {
        const batch = inputBatches[i];
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
          const txt = await embRes.text();
          return NextResponse.json(
            { error: `Embedding error (batch ${i}): ${txt}` },
            { status: 500 }
          );
        }

        const embJson = await embRes.json();
        const batchEmb = (embJson.data || []).map(
          (d: any) => d.embedding || []
        );
        embeddings.push(...batchEmb);

        if (i < inputBatches.length - 1)
          await new Promise((res) => setTimeout(res, 200));
      }

      if (embeddings.length !== news.length)
        return NextResponse.json(
          { error: "Embedding count mismatch" },
          { status: 500 }
        );

      // Insert products into records table
      const rowsToUpsert = news.map((it, idx) => ({
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

      const { error: upsertErr } = await supabase
        .from("records")
        .upsert(rowsToUpsert, { onConflict: "product_ref" });

      if (upsertErr)
        return NextResponse.json({ error: upsertErr.message }, { status: 500 });

      inserted = rowsToUpsert.length;
      inserted_refs = rowsToUpsert.map((r) => r.product_ref).filter(Boolean);

      // Now handle FAQs - extract and generate embeddings
      const faqsToInsert: any[] = [];
      const faqInputs: string[] = [];

      for (const item of news) {
        const faqs = item.faq || [];
        if (Array.isArray(faqs) && faqs.length > 0) {
          for (const faq of faqs) {
            if (faq.q && faq.a) {
              faqsToInsert.push({
                product_ref: item.product_ref,
                question: faq.q,
                answer: faq.a,
              });
              // Combine question + answer for embedding
              faqInputs.push(`${faq.q} ${faq.a}`);
            }
          }
        }
      }

      // Generate embeddings for FAQs if any exist
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
            faq_inserted = faqRows.length;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      inserted_refs: inserted_refs || [],
      faq_inserted,
      duplicates,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
