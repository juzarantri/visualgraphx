"use client";
import React, { useEffect, useState } from "react";
import { Card, Input, DatePicker, Space, Button } from "antd";
import SessionList from "./SessionList";
import SessionViewer from "./SessionViewer";
import styles from "../chats/Chat.module.css";
import local from "./ChatHistory.module.css";
import type { SessionRow } from "./types";
const { RangePicker } = DatePicker;

export default function ChatHistoryModule() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, any[]>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void loadSessions();
  }, [page, pageSize, search, dateRange]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));
      if (search) params.set("q", search);
      if (dateRange) {
        params.set("date_from", dateRange[0]);
        params.set("date_to", dateRange[1]);
      }
      const res = await fetch(`/api/chat/history/list?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setSessions(data.sessions || []);
        setTotal((data.meta && data.meta.total) || 0);
      } else {
        console.error("failed to load sessions", data);
      }
    } catch (e) {
      console.error("fetch sessions error", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (key: string) => {
    if (messagesMap[key]) return;
    try {
      const res = await fetch(`/api/chat?session_id=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (res.ok) {
        setMessagesMap((m) => ({ ...m, [key]: data.chats || [] }));
      } else {
        console.error("failed to load chat for session", data);
        setMessagesMap((m) => ({ ...m, [key]: [] }));
      }
    } catch (e) {
      console.error("load chat error", e);
      setMessagesMap((m) => ({ ...m, [key]: [] }));
    }
  };

  return (
    <Card className={styles.chatCard} variant="borderless" style={{ width: "100%", maxWidth: "100%", margin: 0, boxShadow: "none" }}>
      <div className={styles.chatInner} style={{ padding: 8, paddingLeft: 0 }}>
        <div className={local.containerFlex}>
          <div className={local.sidebar}>
            <div className={local.controls}>
              <Input placeholder="Search session id" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
              <RangePicker onChange={(vals, strs) => {
                setPage(1);
                if (vals && vals[0] && vals[1]) {
                  try {
                    const start = vals[0].startOf("day").toDate();
                    const end = vals[1].endOf("day").toDate();
                    setDateRange([start.toISOString(), end.toISOString()]);
                  } catch (e) {
                    if (strs && strs[0] && strs[1]) setDateRange([strs[0], strs[1]]);
                    else setDateRange(null);
                  }
                } else setDateRange(null);
              }} />
            </div>

            <div className={local.sessionList}>
              <SessionList sessions={sessions} loading={loading} selected={selected} onSelect={async (k) => { setSelected(k); await loadMessages(k); }} />
            </div>

            <div className={local.pagerRow}>
              <Space>
                <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</Button>
                <Button onClick={() => setPage((p) => p + 1)} disabled={sessions.length === 0 || page * pageSize >= total}>Next</Button>
              </Space>
              <div className={local.pageInfo}>Page {page} • {total} items</div>
            </div>
          </div>

          <div className={local.mainPanel}>
            <div className={local.panelInner}>
              <SessionViewer selected={selected} sessions={sessions} messages={messagesMap} />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
