import React from "react";

// Minimal layout for the embeddable chat iframe. Keeps the page as small and
// isolated as possible so it can be loaded inside an iframe by the external
// embed script.
export const metadata = {
  title: "Chat Widget",
};

export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, height: "100%", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
