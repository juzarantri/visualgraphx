// ============================================
// /api/chat/route.ts
// ============================================

// Example Usage:

// "What outdoor decals do you have?" → searches products
// "Can decals be used outdoors?" → searches FAQs
// "Tell me about your Arlon wraps and installation tips" → searches both

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "user" | "assistant" | "system" | "tool";
type IncomingMessage = {
  role: Role;
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

// Function definitions for OpenAI
const SEARCH_PRODUCTS_FUNCTION = {
  name: "search_products",
  description:
    "Search for products in the database based on user query. Use this when the user asks about products, pricing, or product information.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to find relevant products",
      },
      limit: {
        type: "number",
        description: "Maximum number of products to return (default: 3)",
        default: 3,
      },
      category: {
        type: "string",
        description:
          "Optional category filter (e.g., 'Decals', 'Wraps', 'Banners')",
      },
    },
    required: ["query"],
  },
};

const SEARCH_FAQS_FUNCTION = {
  name: "search_faqs",
  description:
    "Search for frequently asked questions across all products. Use this when the user asks general questions about product features, usage, installation, or common concerns.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The question or topic to search for in FAQs",
      },
      limit: {
        type: "number",
        description: "Maximum number of FAQs to return (default: 3)",
        default: 3,
      },
    },
    required: ["query"],
  },
};

async function searchProducts(
  query: string,
  limit: number = 3,
  category: string | null = null,
  supabaseClient: any,
  openaiApiKey: string
) {
  try {
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    if (!embRes.ok) return [];

    const embJson = await embRes.json();
    const queryEmbedding = embJson.data?.[0]?.embedding;

    if (!Array.isArray(queryEmbedding)) return [];

    const { data, error } = await supabaseClient.rpc("match_records", {
      query_embedding: queryEmbedding,
      match_count: limit,
      similarity_threshold: 0.5,
      category_filter: category,
    });

    if (error) {
      console.error("match_records error:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Product search error:", error);
    return [];
  }
}

async function searchFAQs(
  query: string,
  limit: number = 3,
  supabaseClient: any,
  openaiApiKey: string
) {
  try {
    const embRes = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: query,
      }),
    });

    if (!embRes.ok) return [];

    const embJson = await embRes.json();
    const queryEmbedding = embJson.data?.[0]?.embedding;

    if (!Array.isArray(queryEmbedding)) return [];

    const { data, error } = await supabaseClient.rpc("match_faqs", {
      query_embedding: queryEmbedding,
      match_count: limit,
      similarity_threshold: 0.5,
    });

    if (error) {
      console.error("match_faqs error:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("FAQ search error:", error);
    return [];
  }
}

async function processConversationWithFunctions(
  messages: IncomingMessage[],
  supabaseClient: any,
  openaiApiKey: string
) {
  let conversationMessages = [...messages];

  while (true) {
    const payload: any = {
      model: "gpt-4o",
      messages: conversationMessages,
      temperature: 0.7,
      stream: false,
    };

    if (supabaseClient) {
      payload.tools = [
        {
          type: "function",
          function: SEARCH_PRODUCTS_FUNCTION,
        },
        {
          type: "function",
          function: SEARCH_FAQS_FUNCTION,
        },
      ];
      payload.tool_choice = "auto";
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`OpenAI error: ${res.status}`);
    }

    const response = await res.json();
    const assistantMessage = response.choices[0].message;

    if (!assistantMessage.tool_calls) {
      return makeStreamingRequest(
        conversationMessages,
        openaiApiKey,
        supabaseClient
      );
    }

    conversationMessages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.function.name === "search_products" && supabaseClient) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const products = await searchProducts(
            args.query,
            args.limit || 3,
            args.category || null,
            supabaseClient,
            openaiApiKey
          );

          const productText = products
            .map((p: any) => {
              const parts = [
                `Product: ${p.title || p.product_ref}`,
                p.description ? `Description: ${p.description}` : "",
                p.price != null ? `Price: $${p.price}` : "",
                p.url ? `URL: ${p.url}` : "",
                p.technical_data ? `Details: ${p.technical_data}` : "",
                p.similarity
                  ? `(Relevance: ${(p.similarity * 100).toFixed(1)}%)`
                  : "",
              ]
                .filter(Boolean)
                .join("\n");
              return parts;
            })
            .join("\n\n");

          conversationMessages.push({
            role: "tool",
            content: productText || "No products found.",
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          conversationMessages.push({
            role: "tool",
            content: "Error searching products.",
            tool_call_id: toolCall.id,
          });
        }
      } else if (toolCall.function.name === "search_faqs" && supabaseClient) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const faqs = await searchFAQs(
            args.query,
            args.limit || 3,
            supabaseClient,
            openaiApiKey
          );

          const faqText = faqs
            .map((f: any) => {
              return `Q: ${f.question}\nA: ${f.answer}\n(Product: ${
                f.product_ref
              }, Relevance: ${(f.similarity * 100).toFixed(1)}%)`;
            })
            .join("\n\n");

          conversationMessages.push({
            role: "tool",
            content: faqText || "No FAQs found.",
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          conversationMessages.push({
            role: "tool",
            content: "Error searching FAQs.",
            tool_call_id: toolCall.id,
          });
        }
      }
    }
  }
}

async function makeStreamingRequest(
  messages: IncomingMessage[],
  openaiApiKey: string,
  supabaseClient: any
) {
  const payload: any = {
    model: "gpt-4o",
    messages: messages,
    temperature: 0.7,
    stream: true,
  };

  if (supabaseClient) {
    payload.tools = [
      {
        type: "function",
        function: SEARCH_PRODUCTS_FUNCTION,
      },
      {
        type: "function",
        function: SEARCH_FAQS_FUNCTION,
      },
    ];
    payload.tool_choice = "auto";
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    throw new Error(`OpenAI streaming error: ${res.status}`);
  }

  return res;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages?: IncomingMessage[];
      session_id?: string;
    };
    const messages = body.messages;
    if (!messages)
      return NextResponse.json({ error: "messages required" }, { status: 400 });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY)
      return NextResponse.json(
        { error: "OPENAI_API_KEY not set" },
        { status: 500 }
      );

    let supabase: any = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
    }

    const streamingResponse = await processConversationWithFunctions(
      messages,
      supabase,
      OPENAI_API_KEY
    );

    const stream = new ReadableStream({
      async start(controller) {
        const reader = streamingResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            const lines = trimmed.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const data = line.replace(/^data:\s*/, "");
              if (data === "[DONE]") {
                controller.enqueue(
                  new TextEncoder().encode("data: [DONE]\n\n")
                );
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content || "";
                if (delta) {
                  const payload = JSON.stringify({ content: delta });
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${payload}\n\n`)
                  );
                }
              } catch {
                // ignore JSON parse errors
              }
            }
          }
        }

        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const session_id = url.searchParams.get("session_id");
    if (!session_id)
      return NextResponse.json(
        { error: "session_id required" },
        { status: 400 }
      );

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

    const { data, error } = await supabase
      .from("user_chats")
      .select("chats")
      .eq("session_id", session_id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ chats: data?.chats ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
