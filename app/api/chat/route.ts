// ============================================
// /api/chat/route.ts - Enhanced Hybrid Search Version
// ============================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

// Enhanced system prompt with context awareness
const SYSTEM_PROMPT = `You are a knowledgeable and friendly product specialist having a real conversation with a customer. You're here to help them find products and answer their questions in the most natural, human way possible.

**Your Conversational Style:**
- Talk like you're texting a friend who asked for help - warm, genuine, and natural
- NEVER mention that you "don't have information" or "searched the database" - that's robotic
- If you don't find specific info, just share what you DO know confidently
- Skip phrases like "It looks like...", "I see that...", "According to..." - just tell them!
- Match their vibe - if they're excited, be excited. If they're chill, be chill

**The Golden Rule:**
When the system gives you data, TRANSFORM it completely. Don't just reformat it - reimagine it as if YOU'RE the expert sharing your knowledge naturally.

**Smart Pagination - YOU Control It:**
You have access to search_products with an 'offset' parameter. Use your judgment to decide when to paginate:

Examples of when to use offset:
- User: "Show me banners" → offset: 0 (new search)
- User: "Can you show more?" → offset: 3 (if you showed 3 before)
- User: "Any others?" → offset: 6 (if you've shown 6 total)
- User: "What else do you have?" → Use offset based on conversation
- User: "Show me different ones" → Use offset to skip what was shown
- User: "I don't like these, show me others" → Increase offset

Examples when NOT to use offset:
- User: "Tell me more about the first one" → No search needed
- User: "What's the price of that banner?" → No new search
- User: "Show me vinyl wraps" → offset: 0 (different product, new search)

**Price Filtering - YOU Decide:**
Extract price constraints from natural language:
- "under $10" → max_price: 10
- "less than $20" → max_price: 20  
- "over $50" → min_price: 50
- "more than $100" → min_price: 100
- "between $5 and $15" → min_price: 5, max_price: 15
- "around $10" → min_price: 8, max_price: 12 (your judgment!)
- "cheap banners" → max_price: 15 (reasonable guess)
- "premium quality" → min_price: 50 (your judgment!)

**How to Handle Different Scenarios:**

When you find SPECIFIC product info:
- Jump right in: "Oh yes! The Arlon DPF 8000 is awesome for..."
- Weave in specs naturally: "It'll run you about $299, which is pretty solid for a premium cast vinyl"
- Only mention what matters to THEIR question

When showing MORE products:
- Acknowledge naturally: "Sure! Here are a few more options..."
- Don't repeat what they've already seen
- Keep the energy up: "Check these out..."

When they add price filters:
- Confirm casually: "Got it, looking under $10..."
- Present options that fit their budget
- Suggest alternatives if nothing matches: "These are just slightly above, but might be worth it..."

When you DON'T find specific info:
- NEVER say "we don't have that info" or "no FAQs found"
- Just answer from general knowledge like a helpful expert would
- Example: Instead of "We don't have installation instructions", say "I can definitely walk you through that! Here's how most people do it..."
- Be confident - you're helping, not apologizing

**Formatting Guidelines:**
- **Bold** sparingly - only for product names or key points
- Use short paragraphs (2-3 sentences max)
- Bullet points ONLY when listing 3+ items
- Write how people actually talk, not how manuals read

**What to NEVER Say:**
❌ "It looks like we don't have..."
❌ "According to our database..."
❌ "I found X results..."
❌ "Based on the search results..."
❌ "Let me check that for you..."
❌ "I don't have specific information about..."

**What to Say Instead:**
✅ Just start with the answer
✅ "Here's what I'd recommend..."
✅ "So basically..."
✅ "The cool thing about this is..."
✅ "Sure! Here are some more..."
✅ "Check these out..."

**Remember:**
- You're not a search engine giving results - you're a knowledgeable person sharing expertise
- Confidence is key - even when improvising with general knowledge
- Every response should feel like it came from a helpful human, not a database query
- Track the conversation flow and build on previous exchanges`;

const SEARCH_PRODUCTS_FUNCTION = {
  name: "search_products",
  description:
    "Search for products with advanced filtering and pagination. Use this for product queries, pricing searches, and when users want to see more results.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The search query to find relevant products (e.g., 'banners', 'vinyl wrap', 'window perf')",
      },
      limit: {
        type: "number",
        description: "Maximum number of products to return (default: 3)",
        default: 3,
      },
      offset: {
        type: "number",
        description:
          "Number of products to skip for pagination (default: 0). Use this when user asks for 'more' results.",
        default: 0,
      },
      max_price: {
        type: "number",
        description:
          "Maximum price filter (e.g., 10 for 'under $10'). Optional.",
      },
      min_price: {
        type: "number",
        description:
          "Minimum price filter (e.g., 50 for 'over $50'). Optional.",
      },
    },
    required: ["query"],
  },
};

const SEARCH_FAQS_FUNCTION = {
  name: "search_faqs",
  description:
    "Search frequently asked questions. Use this when the user asks about product usage, installation, durability, compatibility, or general product questions.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The question or topic to search for",
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

interface SearchProductsParams {
  query: string;
  limit?: number;
  offset?: number;
  max_price?: number;
  min_price?: number;
}

async function searchProducts(
  params: SearchProductsParams,
  supabaseClient: any,
  openaiApiKey: string
) {
  try {
    const { query, limit = 3, offset = 0, max_price, min_price } = params;

    log("info", "searchProducts called", {
      query,
      limit,
      offset,
      max_price,
      min_price,
    });

    // Get embedding for semantic search
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
    if (!Array.isArray(queryEmbedding)) return [];

    // Build the RPC arguments
    const rpcArgs: any = {
      query_embedding: queryEmbedding,
      match_count: limit + offset, // Get more results to handle offset
      min_price_filter: min_price ?? null,
      max_price_filter: max_price ?? null,
    };

    const { data, error } = await supabaseClient.rpc(
      "match_records_hybrid",
      rpcArgs
    );

    if (error) {
      log("error", "match_records_hybrid error", error);
      return [];
    }

    // Apply offset manually (since we fetched limit + offset)
    const paginatedData = (data || []).slice(offset, offset + limit);

    log("info", "match_records_hybrid returned", {
      total: (data || []).length,
      returned: paginatedData.length,
      offset,
    });

    return paginatedData;
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
    if (!Array.isArray(queryEmbedding)) return [];

    const rpcArgs = {
      query_embedding: queryEmbedding,
      match_count: limit,
    } as any;

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

function formatProductsForAssistant(
  products: any[],
  userQuery: string,
  offset: number = 0
): string {
  if (products.length === 0) {
    if (offset > 0) {
      return `[Note: No more products found beyond the ${offset} already shown. Let the user know you've shown them everything available, but do it casually like "That's all we've got for now" or "Those are all the options I have". Don't say "no more results found".]`;
    }
    return `[Note: No specific products found for "${userQuery}". You can either suggest similar products from your general knowledge, or ask clarifying questions about what they're looking for. Don't mention that no products were found - just help them naturally.]`;
  }

  let formatted = `[You found ${products.length} relevant product(s)${
    offset > 0 ? ` (showing more beyond the first ${offset})` : ""
  }. Present these naturally in your response - don't just list them. Weave the information into a conversational answer.]\n\n`;

  products.forEach((p: any, index: number) => {
    formatted += `Product ${index + 1}:\n`;

    if (p.title) {
      formatted += `Name: ${p.title}\n`;
    } else if (p.product_ref) {
      formatted += `Reference: ${p.product_ref}\n`;
    }

    if (p.description) {
      formatted += `About: ${p.description}\n`;
    }

    if (p.price != null) {
      formatted += `Price: $${p.price}\n`;
    }

    if (p.technical_data) {
      formatted += `Technical Info: ${p.technical_data}\n`;
    }

    if (p.url) {
      formatted += `More Info: ${p.url}\n`;
    }

    if (p.image_url) {
      formatted += `Image: ${p.image_url}\n`;
    }

    formatted += "\n";
  });

  formatted += `[Remember: Transform this data into natural conversation. Don't say "I found X products" - just talk about them like you know them well.]`;

  return formatted;
}

function formatFAQsForAssistant(faqs: any[], userQuery: string): string {
  if (faqs.length === 0) {
    return `[Note: No specific FAQs found for "${userQuery}". This is totally fine! Just answer the question using your general knowledge about the topic. Be confident and helpful - don't mention that you didn't find FAQs.]`;
  }

  let formatted = `[Great! Found ${faqs.length} relevant Q&As. Use this info to answer naturally - don't format it as Q&A in your response. Just take the knowledge and share it conversationally.]\n\n`;

  faqs.forEach((faq: any, index: number) => {
    formatted += `Knowledge Point ${index + 1}:\n`;
    formatted += `Topic: ${faq.question}\n`;
    formatted += `Info: ${faq.answer}\n`;
    if (faq.product_ref) {
      formatted += `Related Product: ${faq.product_ref}\n`;
    }
    formatted += "\n";
  });

  formatted += `[Transform this into a natural, flowing answer. Act like this is knowledge you just know, not information you looked up.]`;

  return formatted;
}

// Track conversation context for pagination
// Stateless: remove conversation context tracking (session state not preserved)

async function processConversationWithFunctions(
  messages: IncomingMessage[],
  supabaseClient: any,
  openaiApiKey: string,
  sessionId?: string
) {
  const hasSystemPrompt = messages.some((msg) => msg.role === "system");
  let conversationMessages: IncomingMessage[] = hasSystemPrompt
    ? [...messages]
    : [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  log("info", "processConversationWithFunctions start", {
    initialMessages: conversationMessages.length,
    hasSystemPrompt,
    sessionId,
  });

  // Stateless: do not retrieve or store conversation context

  while (true) {
    const payload: any = {
      model: "gpt-4o",
      messages: conversationMessages,
      temperature: 0.8,
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
      const text = await res.text().catch(() => "<no body>");
      log("error", "OpenAI error response", {
        status: res.status,
        bodyPreview: text.slice(0, 1000),
      });
      throw new Error(`OpenAI error: ${res.status}`);
    }

    const response = await res.json();
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

    const lastUserMessage = messages[messages.length - 1]?.content || "";

    for (const toolCall of assistantMessage.tool_calls) {
      log("info", "processing tool call", {
        id: toolCall.id,
        name: toolCall.function.name,
      });

      if (toolCall.function.name === "search_products" && supabaseClient) {
        try {
          const args = JSON.parse(
            toolCall.function.arguments
          ) as SearchProductsParams;

          // No session context: honor provided offset only; do not auto-increment

          const products = await searchProducts(
            args,
            supabaseClient,
            openaiApiKey
          );

          // Stateless: do not update any session context

          const productText = formatProductsForAssistant(
            products,
            lastUserMessage,
            args.offset || 0
          );

          conversationMessages.push({
            role: "tool",
            content: productText,
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          log("error", "error processing search_products tool call", error);
          conversationMessages.push({
            role: "tool",
            content:
              "[Search had an issue, but that's okay - just answer naturally with general product knowledge you have.]",
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

          const faqText = formatFAQsForAssistant(faqs, lastUserMessage);

          conversationMessages.push({
            role: "tool",
            content: faqText,
            tool_call_id: toolCall.id,
          });
        } catch (error) {
          log("error", "error processing search_faqs tool call", error);
          conversationMessages.push({
            role: "tool",
            content:
              "[Search had an issue, but no worries - just answer their question naturally with what you know about the topic.]",
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
    temperature: 0.8,
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
    const sessionId = body.session_id;

    log("info", "POST /api/chat received", {
      hasMessages: Array.isArray(messages),
      session_id: sessionId,
    });

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
      log("info", "supabase client created", { url: SUPABASE_URL });
    }

    const streamingResponse = await processConversationWithFunctions(
      messages,
      supabase,
      OPENAI_API_KEY,
      sessionId
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
