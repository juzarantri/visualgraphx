"use client";
import React, { useEffect } from "react";
import Chat from "../components/chats";

export default function EmbedPage() {
  useEffect(() => {
    // Handshake-based postMessage handling to support cross-origin embedding.
    // Parent must send a { type: 'vgx:handshake' } message; we record the parent origin
    // and reply with an ack. Subsequent control messages are only accepted from that origin.
    let parentOrigin: string | null = null;

    function onMessage(ev: MessageEvent) {
      const data = ev.data || {};

      // Accept handshake from any origin; record the parent origin and ack back.
      if (data.type === "vgx:handshake") {
        parentOrigin = ev.origin;
        try {
          // reply to the source window if possible
          (ev.source as Window | null)?.postMessage(
            { type: "vgx:handshake:ack" },
            ev.origin
          );
        } catch (e) {
          // best-effort
        }
        return;
      }

      // Only accept runtime control messages from the recorded parent origin.
      if (!parentOrigin || ev.origin !== parentOrigin) return;

      if (data.type === "vgx:focus") {
        const ta = document.querySelector("textarea");
        if (ta instanceof HTMLElement) ta.focus();
      }
      if (data.type === "vgx:open") {
        // parent asked us to open; focus input
        const ta = document.querySelector("textarea");
        if (ta instanceof HTMLElement) ta.focus();
      }
      if (data.type === "vgx:close") {
        // nothing server-side needs to do; parent closes wrapper
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div
      style={{
        height: "90%",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        // padding: 12,
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: 360, maxWidth: "100%", height: "100%" }}>
        <Chat />
      </div>
    </div>
  );
}
