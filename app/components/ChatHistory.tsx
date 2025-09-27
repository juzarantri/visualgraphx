"use client";
import React, { useEffect, useState } from "react";
import {
  Card,
  List,
  Button,
  Spin,
  Empty,
  Input,
  DatePicker,
  Space,
} from "antd";
import ChatMessage from "./chats/ChatMessage";
import styles from "./chats/Chat.module.css";
const { RangePicker } = DatePicker;

type SessionRow = {
  id: string;
  session_id: string;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
  message_count?: number;
};

export default function ChatHistory() {
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
      const res = await fetch(
        `/api/chat?session_id=${encodeURIComponent(key)}`
      );
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
    <Card
      className={styles.chatCard}
      variant="borderless"
      style={{ width: "100%", maxWidth: "100%", margin: 0, boxShadow: "none" }}
    >
      <div className={styles.chatInner} style={{ padding: 8, paddingLeft: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <div style={{ width: "30%", minWidth: 280, paddingLeft: 8 }}>
            <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
              <Input
                placeholder="Search session id"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                }}
              />
              <RangePicker
                onChange={(vals, strs) => {
                  setPage(1);
                  if (vals && vals[0] && vals[1]) {
                    // vals are moment objects (antd) — convert to local start/end then to UTC ISO
                    try {
                      const start = vals[0].startOf("day").toDate();
                      const end = vals[1].endOf("day").toDate();
                      setDateRange([start.toISOString(), end.toISOString()]);
                    } catch (e) {
                      // fallback to string values if moment not available
                      if (strs && strs[0] && strs[1])
                        setDateRange([strs[0], strs[1]]);
                      else setDateRange(null);
                    }
                  } else setDateRange(null);
                }}
              />
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: 24 }}>
                <Spin />
              </div>
            ) : sessions.length === 0 ? (
              <Empty description="No chat sessions" />
            ) : (
              <List
                dataSource={sessions}
                renderItem={(s: SessionRow) => {
                  const key = s.session_id;
                  const isSelected = selected === key;
                  return (
                    <List.Item
                      style={{
                        cursor: "pointer",
                        background: isSelected ? "#eef6ff" : "#ffffff",
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 8,
                        border: isSelected
                          ? "1px solid #b6e0fe"
                          : "1px solid #f0f0f0",
                      }}
                      onClick={async () => {
                        setSelected(key);
                        await loadMessages(key);
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <strong
                            style={{ wordBreak: "break-all", display: "block" }}
                          >
                            {s.session_id}
                          </strong>
                          <div
                            style={{
                              color: "#64748b",
                              fontSize: 12,
                              marginTop: 6,
                            }}
                          >
                            {s.created_at
                              ? new Date(s.created_at).toLocaleString()
                              : ""}
                            {s.message_count
                              ? ` • ${s.message_count} messages`
                              : ""}
                          </div>
                        </div>
                        {/* no open button - clicking selects */}
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <Space>
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <Button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={sessions.length === 0 || page * pageSize >= total}
                >
                  Next
                </Button>
              </Space>
              <div style={{ color: "#64748b", fontSize: 12 }}>
                Page {page} • {total} items
              </div>
            </div>
          </div>

          <div style={{ width: "70%", paddingLeft: 0 }}>
            <div style={{ borderRadius: 8, padding: 6, width: "100%" }}>
              {!selected ? (
                <div style={{ color: "#64748b", padding: 24 }}>
                  Select a session to view messages
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <strong style={{ wordBreak: "break-all" }}>
                      {selected}
                    </strong>
                    <div style={{ color: "#64748b", fontSize: 12 }}>
                      {sessions.find((s) => s.session_id === selected)
                        ?.created_at
                        ? new Date(
                            sessions.find(
                              (s) => s.session_id === selected
                            )!.created_at!
                          ).toLocaleString()
                        : ""}
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: 8,
                      padding: 12,
                      boxShadow: "0 6px 18px rgba(22,27,34,0.06)",
                      width: "100%",
                    }}
                  >
                    <div
                      className={styles.scrollArea}
                      style={{ maxHeight: 640 }}
                    >
                      {(messagesMap[selected] || []).length === 0 ? (
                        <div style={{ color: "#94a3b8" }}>No messages</div>
                      ) : (
                        (messagesMap[selected] || []).map(
                          (m: any, i: number) => (
                            <ChatMessage key={i} message={m} />
                          )
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
