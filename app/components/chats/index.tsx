"use client";
import React, { useState, useRef, useEffect } from "react";
import { Card, message as antdMessage } from "antd";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import type { ChatMessage as MessageType } from "./types";
import styles from "./Chat.module.css";

export default function Chat() {
  const [messages, setMessages] = useState<MessageType[]>([]);
  const messagesRef = useRef<MessageType[]>(messages);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // generate a new session id per mount (in-memory only). Use useEffect so
  // a new id is created on every mount/refresh and not preserved by React Fast Refresh.
  const [sessionId, setSessionId] = useState<string>("");
  useEffect(() => {
    const id = `sess_${crypto.randomUUID?.() ?? Date.now().toString()}`;
    setSessionId(id);
    // debug: show session id generation in console to verify new id on reload
    console.debug("[Chat] sessionId generated", id);
  }, []);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    messagesRef.current = messages;
  }, [messages]);

  const send = async (value: string) => {
    if (!value.trim()) return;

    const now = new Date().toISOString();
    const userMessage: MessageType = {
      role: "user",
      content: value,
      sent_at: now,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    const assistantIndex = newMessages.length;
    const assistantPlaceholder: MessageType = {
      role: "assistant",
      content: "",
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, session_id: sessionId }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const payload = part.replace(/^data: /, "").trim();
          if (payload === "[DONE]") {
            setLoading(false);
            break;
          }

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.content;
            if (delta) {
              setMessages((prev) => {
                const copy = [...prev];
                if (!copy[assistantIndex])
                  copy[assistantIndex] = {
                    role: "assistant",
                    content: "",
                  };
                copy[assistantIndex] = {
                  ...copy[assistantIndex],
                  content: copy[assistantIndex].content + delta,
                };
                return copy;
              });
            }
          } catch (e) {
            console.error("failed to parse chunk", e);
          }
        }
      }
      // when streaming completes, persist the full chat history to the history endpoint
      // mark received_at timestamp for assistant before persisting
      setMessages((prev) => {
        const copy = [...prev];
        // assistant is the last message
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant")
          last.received_at = new Date().toISOString();
        messagesRef.current = copy;
        return copy;
      });

      const persist = async () => {
        try {
          const final = await fetch("/api/chat/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              chats: messagesRef.current,
            }),
          });
          if (!final.ok) console.error("failed to persist chat history");
        } catch (e) {
          console.error("persist error", e);
        }
      };

      // call persist after streaming has signalled done — the stream loop sets loading false on [DONE]
      // ensure we wait a tick to give the client stream loop time to process the final chunk
      setTimeout(() => void persist(), 50);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      antdMessage.error(msg || "Chat error");
      setLoading(false);
    }
  };

  return (
    <Card className={styles.chatCard} variant="borderless">
      <div className={styles.chatInner}>
        <div ref={scrollRef} className={styles.scrollArea}>
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              No messages yet — start the conversation.
            </div>
          ) : (
            messages.map((m, i) => <ChatMessage key={i} message={m} />)
          )}
        </div>

        <ChatInput onSend={send} disabled={loading} />
      </div>
    </Card>
  );
}
