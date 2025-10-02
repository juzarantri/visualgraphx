// ============================================
// /api/records/list/route.ts
// ============================================

// =============
// Usage
// ============

// List all products
// GET /api/records/list

// List only 50 products
// GET /api/records/list?limit=50

// List only Decals category
// GET /api/records/list?category=Decals

// List 20 Wraps
// GET /api/records/list?category=Wraps&limit=20

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
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

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "1000");
    const category = url.searchParams.get("category");

    let query = supabase
      .from("records")
      .select(
        "product_ref,title,description,price,technical_data,url,image_url,metadata,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    // Filter by category if provided
    if (category) {
      query = query.eq("metadata->>category", category);
    }

    const { data: records, error } = await query;

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Get all FAQs for the products
    const productRefs = (records || []).map((r: any) => r.product_ref);

    let faqsByProduct: { [key: string]: any[] } = {};
    if (productRefs.length > 0) {
      const { data: faqData } = await supabase
        .from("product_faqs")
        .select("product_ref,question,answer")
        .in("product_ref", productRefs);

      if (faqData) {
        faqsByProduct = faqData.reduce((acc: any, faq: any) => {
          if (!acc[faq.product_ref]) {
            acc[faq.product_ref] = [];
          }
          acc[faq.product_ref].push({
            q: faq.question,
            a: faq.answer,
          });
          return acc;
        }, {});
      }
    }

    // Attach FAQs to each record
    const recordsWithFaqs = (records || []).map((record: any) => ({
      ...record,
      faq: faqsByProduct[record.product_ref] || [],
    }));

    return NextResponse.json({
      ok: true,
      records: recordsWithFaqs,
      total: recordsWithFaqs.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
