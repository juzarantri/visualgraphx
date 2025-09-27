"use client";
import React from "react";
import type { SessionRow } from "./types";
import css from "./ChatHistory.module.css";

export default function SessionItem({
  session,
  selected,
  onSelect,
}: {
  session: SessionRow;
  selected: boolean;
  onSelect: (k: string) => void;
}) {
  const className = `${css.sessionItem} ${
    selected ? css.sessionItemSelected : ""
  }`;

  return (
    <div className={className} onClick={() => onSelect(session.session_id)}>
      <div className={css.sessionItemContent}>
        <div>
          <strong className={css.sessionId}>{session.session_id}</strong>
          <div className={css.sessionMeta}>
            {session.created_at
              ? new Date(session.created_at).toLocaleString()
              : ""}
            {session.message_count
              ? ` • ${session.message_count} messages`
              : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
