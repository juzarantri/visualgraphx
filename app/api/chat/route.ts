import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "user" | "assistant" | "system";
type IncomingMessage = { role: Role; content: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      messages?: IncomingMessage[];
      session_id?: string;
    };
    const messages = body.messages;
    if (!messages)
      return NextResponse.json({ error: "messages required" }, { status: 400 });

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY)
      return NextResponse.json(
        { error: "OPENAI_API_KEY not set" },
        { status: 500 }
      );

    // Build request to OpenAI Chat Completions (stream)
    const payload = {
      model: "gpt-4o",
      messages: messages.map((m: IncomingMessage) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: 0.7,
      stream: true,
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      const text = await res.text();
      return NextResponse.json(
        { error: "OpenAI error", details: text },
        { status: res.status }
      );
    }
    // we'll collect assistant text as we stream so the client can persist it after stream completion
    let assistantText = "";

    // Stream the OpenAI chunks and convert them into simple JSON lines wrapped as SSE data: ...\n\n
    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body!.getReader();
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
            // each part may have multiple lines like: data: {json}\n
            const lines = trimmed.split("\n");
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const data = line.replace(/^data:\s*/, "");
              if (data === "[DONE]") {
                // signal done to client
                controller.enqueue(
                  new TextEncoder().encode("data: [DONE]\n\n")
                );
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(data) as unknown;
                // OpenAI chat.completions stream may have delta content at parsed.choices[0].delta.content
                const parsedTyped = parsed as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const delta = parsedTyped.choices?.[0]?.delta?.content || "";
                if (delta) assistantText += delta;
                // send a simplified JSON with the delta text
                const payload = JSON.stringify({ content: delta });
                controller.enqueue(
                  new TextEncoder().encode(`data: ${payload}\n\n`)
                );
              } catch {
                // ignore JSON parse errors
              }
            }
          }
        }

        // if stream ends naturally
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    // After the response stream is prepared we return it to the client. Persistence will be handled by the
    // separate history endpoint which the client will call after the stream completes.

    const response = new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
    return response;
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

    // Using the service role key for server-side reads of stored chat history.
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
