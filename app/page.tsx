"use client";
import React, { useState } from "react";
import { Layout, Menu } from "antd";
import type { MenuInfo } from "rc-menu/lib/interface";
import {
  MessageOutlined,
  HistoryOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import Chat from "./components/chats";
import ChatHistory from "./components/chathistory";
import Datasets from "./components/Datasets";

const { Sider, Content, Header } = Layout;

export default function Page() {
  const [selected, setSelected] = useState<string>("chat");

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
        <Header style={{ background: "#fff", padding: "0 16px" }}>
          <h3 style={{ margin: 0 }}>
            {selected === "chat"
              ? "Chat"
              : selected === "history"
              ? "Chat History"
              : "Train Chatbot"}
          </h3>
        </Header>

        <Content style={{ margin: 16 }}>
          <div
            style={{
              padding: 16,
              minHeight: 360,
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
