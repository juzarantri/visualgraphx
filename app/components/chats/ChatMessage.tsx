"use client";
import React from "react";
import styles from "./Chat.module.css";
import type { ChatMessage as MessageType } from "./types";

const roleLabel = (role: MessageType["role"]) => {
  if (role === "user") return "You";
  if (role === "assistant") return "Assistant";
  return "System";
};

export default function ChatMessage({ message }: { message: MessageType }) {
  const isUser = message.role === "user";
  const fmt = (iso?: string) => {
    if (!iso) return "";
    try {
      const dt = new Date(iso);
      const rel = Intl.RelativeTimeFormat
        ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
        : null;
      const diff = Date.now() - dt.getTime();
      const seconds = Math.round(diff / 1000);
      if (rel) {
        if (seconds < 60) return "just now";
        if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
      }
      return dt.toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className={styles.messageRow} data-role={message.role}>
      <div className={styles.avatar} aria-hidden>
        {isUser ? "U" : message.role === "assistant" ? "A" : "S"}
      </div>

      <div className={styles.messageBubble}>
        <div className={styles.messageMeta}>
          <span>{roleLabel(message.role)}</span>
          <span className={styles.timestamp}>
            {message.sent_at ? ` • sent ${fmt(message.sent_at)}` : ""}
            {message.received_at
              ? ` • received ${fmt(message.received_at)}`
              : ""}
          </span>
        </div>
        <div className={styles.messageContent}>{message.content}</div>
      </div>
    </div>
  );
}
