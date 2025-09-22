"use client";
import React, { useEffect, useState } from "react";
import { Card, List, Button, Spin, Empty } from "antd";
import ChatMessage from "./chats/ChatMessage";
import styles from "./chats/Chat.module.css";

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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/chat/history/list");
        const data = await res.json();
        if (res.ok) setSessions(data.sessions || []);
        else console.error("failed to load sessions", data);
      } catch (e) {
        console.error("fetch sessions error", e);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

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
        {loading ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Spin />
          </div>
        ) : sessions.length === 0 ? (
          <Empty description="No chat sessions" />
        ) : (
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
              width: "100%",
            }}
          >
            <div style={{ width: "30%", minWidth: 280, paddingLeft: 8 }}>
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
        )}
      </div>
    </Card>
  );
}
