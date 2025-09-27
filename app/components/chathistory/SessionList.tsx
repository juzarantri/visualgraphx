"use client";
import React from "react";
import { Empty, Spin } from "antd";
import SessionItem from "./SessionItem";
import type { SessionRow } from "./types";
import css from "./ChatHistory.module.css";

export default function SessionList({
  sessions,
  loading,
  selected,
  onSelect,
}: {
  sessions: SessionRow[];
  loading: boolean;
  selected: string | null;
  onSelect: (k: string) => void;
}) {
  if (loading)
    return (
      <div className={css.emptySpin}>
        <Spin />
      </div>
    );

  if (!sessions || sessions.length === 0)
    return <Empty description="No chat sessions" />;

  return (
    <div>
      {sessions.map((s) => (
        <SessionItem
          key={s.session_id}
          session={s}
          selected={selected === s.session_id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
