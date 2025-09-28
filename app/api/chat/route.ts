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

// Function definition for OpenAI
const SEARCH_PRODUCTS_FUNCTION = {
  name: "search_products",
  description:
    "Search for products in the database based on user query. Only use this when the user is asking about specific products, prices, or product information.",
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

async function searchProducts(
  query: string,
  limit: number = 3,
  supabaseClient: any,
  openaiApiKey: string
) {
  try {
    // Compute embedding for the query
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

    let recordsData: any[] = [];

    // Try RPC match_records first
    try {
      const { data: rpcData, error: rpcError } = await supabaseClient.rpc(
        "match_records",
        { query: queryEmbedding, match_count: limit }
      );
      if (rpcError) throw rpcError;
      recordsData = (rpcData as any) || [];
    } catch (rpcErr) {
      console.log(
        "RPC match_records error, falling back to client-side",
        rpcErr
      );

      // Fallback: use client-side similarity
      try {
        const { data, error } = await supabaseClient
          .from("records")
          .select(
            "product_ref,title,description,price,url,image_url,technical_data,metadata,embedding"
          )
          .neq("embedding", null)
          .limit(limit)
          .order("created_at", { ascending: false });

        if (!error && Array.isArray(data)) {
          recordsData = data as any[];
        }
      } catch (e) {
        // ignore fallback errors
      }
    }

    return recordsData;
  } catch (error) {
    console.error("Product search error:", error);
    return [];
  }
}

// Handle the full conversation cycle including function calls
async function processConversationWithFunctions(
  messages: IncomingMessage[],
  supabaseClient: any,
  openaiApiKey: string
) {
  let conversationMessages = [...messages];

  while (true) {
    // Build request to OpenAI
    const payload: any = {
      model: "gpt-4o",
      messages: conversationMessages,
      temperature: 0.7,
      stream: false, // Use non-streaming for function calls processing
    };

    // Add tools if Supabase is configured
    if (supabaseClient) {
      payload.tools = [
        {
          type: "function",
          function: SEARCH_PRODUCTS_FUNCTION,
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

    // If no tool calls, we're done - return the final streaming response
    if (!assistantMessage.tool_calls) {
      // Now make a streaming request for the final response
      return makeStreamingRequest(
        conversationMessages,
        openaiApiKey,
        supabaseClient
      );
    }

    // Execute function calls
    conversationMessages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.function.name === "search_products" && supabaseClient) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const products = await searchProducts(
            args.query,
            args.limit || 3,
            supabaseClient,
            openaiApiKey
          );

          // Format products for the AI
          const productText = products
            .map((p, idx) => {
              const title = p.title || p.product_ref || `Product ${idx + 1}`;
              const desc = p.description || "";
              const price = p.price != null ? `Price: $${p.price}` : "";
              const url = p.url || "";
              const tech = p.technical_data || "";
              return `${title}: ${desc} ${price} ${url} ${tech}`.trim();
            })
            .join("\n");

          // Add the function result
          conversationMessages.push({
            role: "tool",
            content: productText || "No products found.",
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          // Add error result
          conversationMessages.push({
            role: "tool",
            content: "Error searching products.",
            tool_call_id: toolCall.id,
          });
        }
      }
    }

    // Continue the loop to get the final response
  }
}

// Make the final streaming request
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

  // Add tools even for streaming (in case more function calls are needed)
  if (supabaseClient) {
    payload.tools = [
      {
        type: "function",
        function: SEARCH_PRODUCTS_FUNCTION,
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

    // Process the conversation and handle any function calls
    const streamingResponse = await processConversationWithFunctions(
      messages,
      supabase,
      OPENAI_API_KEY
    );

    // Stream the final response (same as your original code)
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
                  // Send simplified JSON with just the content (same as original)
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
        {
          error:
            "Supabase env not set (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY)",
        },
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
      return NextResponse.json(
        {
          error: error.message,
          hint: "If this is a permissions error, check Supabase RLS/policies for `user_chats`.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ chats: data?.chats ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
