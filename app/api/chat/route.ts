// ============================================
// /api/chat/route.ts
// ============================================

// Example Usage:

// "What outdoor decals do you have?" → searches products
// "Can decals be used outdoors?" → searches FAQs
// "Tell me about your Arlon wraps and installation tips" → searches both

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lightweight structured logger helper
function log(level: string, message: string, data?: any) {
  const ts = new Date().toISOString();
  try {
    if (data !== undefined)
      console.log(
        `[${ts}] ${level.toUpperCase()} - ${message}`,
        JSON.stringify(data)
      );
    else console.log(`[${ts}] ${level.toUpperCase()} - ${message}`);
  } catch (e) {
    // fallback if JSON.stringify fails
    console.log(`[${ts}] ${level.toUpperCase()} - ${message}`, data);
  }
}

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

// System prompt for friendly, markdown-formatted responses
const SYSTEM_PROMPT = `You are a friendly and knowledgeable product assistant. Your role is to help customers find the right products and answer their questions in a warm, conversational manner.

**Communication Style:**
- Always respond in a friendly, approachable tone as if you're chatting with a friend
- Be enthusiastic about helping customers find what they need
- Use natural, conversational language - avoid being overly formal or robotic
- Show empathy and understanding when customers have questions or concerns
- Keep responses concise but informative

**Formatting Guidelines:**
- ALWAYS format your responses using Markdown
- Use **bold** for product names and key features
- Use bullet points (- or *) for lists of features or benefits
- Use numbered lists (1., 2., 3.) for step-by-step instructions
- Use headers (##, ###) to organize longer responses
- Use > blockquotes for important notes or tips
- Use \`code\` formatting for technical specifications or part numbers

**Product Information:**
- When presenting products, highlight key features and benefits
- Always mention pricing when available
- Include relevant technical details in an easy-to-understand way
- If you have product images or URLs, mention them naturally in your response
- Compare products when customers are deciding between options

**Answering Questions:**
- Give clear, direct answers to FAQs
- Provide practical examples when helpful
- Offer additional related information that might be useful
- If you're not sure about something, be honest and offer to help find more information

**Personality:**
- Be helpful and positive
- Show genuine interest in solving the customer's needs
- Use friendly phrases like "I'd be happy to help!", "Great question!", "Let me find that for you!"
- End responses with an invitation to ask more questions if needed

Remember: You're here to make the customer's shopping experience enjoyable and informative!`;

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
  supabaseClient: any,
  openaiApiKey: string
) {
  try {
    log("info", "searchProducts called", { query, limit });
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
    if (!embRes.ok) {
      log("error", "embeddings request failed", { status: embRes.status });
      return [];
    }

    const embJson = await embRes.json();
    const queryEmbedding = embJson.data?.[0]?.embedding;
    log("debug", "embedding received", {
      ok: Array.isArray(queryEmbedding),
      length: Array.isArray(queryEmbedding) ? queryEmbedding.length : 0,
      preview: Array.isArray(queryEmbedding)
        ? queryEmbedding.slice(0, 5)
        : null,
    });

    if (!Array.isArray(queryEmbedding)) return [];

    const rpcArgs = {
      query_embedding: queryEmbedding,
      match_count: limit,
    } as any;

    log("info", "calling supabase.rpc match_records", {
      match_count: rpcArgs.match_count,
      query_embedding_length: rpcArgs.query_embedding.length,
    });

    const { data, error } = await supabaseClient.rpc("match_records", rpcArgs);

    if (error) {
      log("error", "match_records error", error);
      return [];
    }

    log("info", "match_records returned", { count: (data || []).length });

    return data || [];
  } catch (error) {
    log("error", "Product search error", error);
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
    log("info", "searchFAQs called", { query, limit });
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
    if (!embRes.ok) {
      log("error", "embeddings request failed for FAQs", {
        status: embRes.status,
      });
      return [];
    }

    const embJson = await embRes.json();
    const queryEmbedding = embJson.data?.[0]?.embedding;
    log("debug", "faq embedding received", {
      ok: Array.isArray(queryEmbedding),
      length: Array.isArray(queryEmbedding) ? queryEmbedding.length : 0,
      preview: Array.isArray(queryEmbedding)
        ? queryEmbedding.slice(0, 5)
        : null,
    });

    if (!Array.isArray(queryEmbedding)) return [];

    const rpcArgs = {
      query_embedding: queryEmbedding,
      match_count: limit,
    } as any;

    log("info", "calling supabase.rpc match_faqs", {
      match_count: rpcArgs.match_count,
      query_embedding_length: rpcArgs.query_embedding.length,
    });

    const { data, error } = await supabaseClient.rpc("match_faqs", rpcArgs);

    if (error) {
      log("error", "match_faqs error", error);
      return [];
    }

    log("info", "match_faqs returned", { count: (data || []).length });

    return data || [];
  } catch (error) {
    log("error", "FAQ search error", error);
    return [];
  }
}

async function processConversationWithFunctions(
  messages: IncomingMessage[],
  supabaseClient: any,
  openaiApiKey: string
) {
  // Add system prompt at the beginning if not already present
  const hasSystemPrompt = messages.some((msg) => msg.role === "system");
  let conversationMessages: IncomingMessage[] = hasSystemPrompt
    ? [...messages]
    : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  log("info", "processConversationWithFunctions start", {
    initialMessages: conversationMessages.length,
    hasSystemPrompt,
    preview: conversationMessages.slice(0, 3),
    supabaseAvailable: !!supabaseClient,
  });

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

    log("info", "OpenAI chat completion requested", {
      status: res.status,
      ok: res.ok,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      log("error", "OpenAI error response", {
        status: res.status,
        bodyPreview: text.slice(0, 1000),
      });
      throw new Error(`OpenAI error: ${res.status}`);
    }

    const response = await res.json();
    log("debug", "OpenAI chat completion response", {
      responseSummary: { choices: response.choices?.length ?? 0 },
    });
    const assistantMessage = response.choices[0].message;

    log("info", "assistant message received", {
      role: assistantMessage?.role,
      content_length: assistantMessage?.content?.length ?? 0,
      tool_calls: assistantMessage?.tool_calls?.length ?? 0,
    });

    if (!assistantMessage.tool_calls) {
      return makeStreamingRequest(
        conversationMessages,
        openaiApiKey,
        supabaseClient
      );
    }

    conversationMessages.push(assistantMessage);
    for (const toolCall of assistantMessage.tool_calls) {
      log("info", "processing tool call", {
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      });
      if (toolCall.function.name === "search_products" && supabaseClient) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const products = await searchProducts(
            args.query,
            args.limit || 3,
            supabaseClient,
            openaiApiKey
          );

          log("info", "searchProducts returned items", {
            count: products.length,
            preview: products.slice(0, 2),
          });

          const productText = products
            .map((p: any) => {
              const parts = [
                `Product: ${p.title || p.product_ref}`,
                p.description ? `Description: ${p.description}` : "",
                p.price != null ? `Price: $${p.price}` : "",
                p.url ? `URL: ${p.url}` : "",
                p.image_url ? `Image: ${p.image_url}` : "",
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
          log("error", "error processing search_products tool call", error);
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

          log("info", "searchFAQs returned items", {
            count: faqs.length,
            preview: faqs,
          });

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
          log("error", "error processing search_faqs tool call", error);
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

  log("info", "OpenAI streaming request sent", {
    status: res.status,
    ok: res.ok,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "<no body>");
    log("error", "OpenAI streaming error response", {
      status: res.status,
      preview: text.slice(0, 1000),
    });
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
    log("info", "POST /api/chat received", {
      hasMessages: Array.isArray(messages),
      session_id: body.session_id,
    });
    if (!messages)
      return NextResponse.json({ error: "messages required" }, { status: 400 });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    log("debug", "env-check", {
      hasSupabaseUrl: !!SUPABASE_URL,
      hasSupabaseServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
      hasOpenAiKey: !!OPENAI_API_KEY,
    });

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
      log("info", "supabase client created", { url: SUPABASE_URL });
    }

    const streamingResponse = await processConversationWithFunctions(
      messages,
      supabase,
      OPENAI_API_KEY
    );

    log("info", "received streaming response object", {
      ok: !!streamingResponse?.body,
    });

    const stream = new ReadableStream({
      async start(controller) {
        const reader = streamingResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

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
                // ignore JSON parse errors for streaming chunks
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
    log("info", "GET /api/chat start", { session_id });
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
      log("error", "supabase fetch session error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    log("info", "supabase fetch session success", {
      chats_count: (data?.chats ?? []).length,
    });
    return NextResponse.json({ chats: data?.chats ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
