import React from "react";
import Image from "next/image";
import "antd/dist/reset.css";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html>
      <body suppressHydrationWarning>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            background: "linear-gradient(90deg, #0f172a 0%, #0b1220 100%)",
            color: "white",
          }}
        >
          <Image
            src="/logo.svg"
            alt="visualgraphx"
            width={36}
            height={36}
            priority
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <strong style={{ fontSize: 18, lineHeight: 1 }}>
              visualgraphx
            </strong>
            <small style={{ opacity: 0.8, fontSize: 12 }}>
              Product recommendation chatbot
            </small>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
