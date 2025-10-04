"use client";
import React from "react";
import ChatMessage from "../chats/ChatMessage";
import styles from "../chats/Chat.module.css";
import css from "./ChatHistory.module.css";
import type { SessionRow } from "./types";

export default function SessionViewer({
  selected,
  sessions,
  messages,
}: {
  selected: string | null;
  sessions: SessionRow[];
  messages: Record<string, any[]>;
}) {
  if (!selected)
    return (
      <div
        className={css.sessionHeader}
        style={{ color: "#64748b", padding: 24 }}
      >
        Select a session to view messages
      </div>
    );

  const session = sessions.find((s) => s.session_id === selected);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className={css.sessionHeader}>
        <strong className={css.sessionHeaderStrong}>{selected}</strong>
        <div className={css.sessionHeaderMeta}>
          {session && session.created_at
            ? new Date(session.created_at).toLocaleString()
            : ""}
        </div>
      </div>

      <div className={css.viewerBox}>
        <div className={`${styles.scrollArea} ${css.viewerScroll}`}>
          {(messages[selected] || []).length === 0 ? (
            <div className={css.noMessages}>No messages</div>
          ) : (
            (messages[selected] || []).map((m: any, i: number) => (
              <ChatMessage key={i} message={m} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
