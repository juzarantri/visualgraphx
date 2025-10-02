"use client";
import React, { useState } from "react";
import { Layout, Menu, Button, Modal, Input, message } from "antd";
import type { MenuInfo } from "rc-menu/lib/interface";
import {
  MessageOutlined,
  HistoryOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import Chat from "./components/chats";
import ChatHistory from "./components/chathistory";
import Datasets from "./components/datasets";

const { Sider, Content, Header } = Layout;

export default function Page() {
  const [selected, setSelected] = useState<string>("chat");
  const [embedOpen, setEmbedOpen] = useState(false);
  const scriptTag =
    typeof window !== "undefined"
      ? `<script src=\"${window.location.origin}/chatbot.js\" data-iframe=\"${window.location.origin}/embed\"></script>`
      : `<script src=\"/chatbot.js\" data-iframe=\"/embed\"></script>`;

  return (
    <Layout style={{ minHeight: "calc(100vh - 64px)" }}>
      <Sider collapsible theme="dark">
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          onClick={(info: MenuInfo) => setSelected(String(info.key))}
          items={[
            { key: "chat", icon: <MessageOutlined />, label: "Chat" },
            {
              key: "history",
              icon: <HistoryOutlined />,
              label: "Chat History",
            },
            { key: "datasets", icon: <DatabaseOutlined />, label: "Datasets" },
          ]}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: "#fff",
            padding: "0 16px",  
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h3 style={{ margin: 0 }}>
            {selected === "chat"
              ? "Chat"
              : selected === "history"
              ? "Chat History"
              : "Train Chatbot"}
          </h3>
          {selected === "chat" && (
            <div>
              <Button type="default" onClick={() => setEmbedOpen(true)}>
                Embed widget
              </Button>
            </div>
          )}
        </Header>

        <Modal
          title="Embed chat widget"
          open={embedOpen}
          onCancel={() => setEmbedOpen(false)}
          footer={null}
        >
          <p>
            Copy this script tag into your site&apos;s HTML to embed the chat
            widget:
          </p>
          <Input.TextArea readOnly value={scriptTag} autoSize />
          <div style={{ marginTop: 12, textAlign: "right" }}>
            <Button
              type="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(scriptTag);
                  message.success("Embed script copied to clipboard");
                } catch (e) {
                  message.error("Failed to copy to clipboard");
                }
              }}
            >
              Copy
            </Button>
          </div>
        </Modal>

        <Content style={{ margin: 16 }}>
          <div
            style={{
              padding: 16,
              height: "calc(100vh - 128px)",
              background: "#fff",
              borderRadius: 8,
            }}
          >
            {selected === "chat" && <Chat />}
            {selected === "history" && <ChatHistory />}
            {selected === "datasets" && <Datasets />}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
