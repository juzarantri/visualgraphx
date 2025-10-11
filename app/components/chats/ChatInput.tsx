"use client";
import React, { useState, useEffect, useRef } from "react";
import { Input, Button } from "antd";
import styles from "./Chat.module.css";

const { TextArea } = Input;

type Props = {
  onSend: (value: string) => void;
  disabled?: boolean;
};

export default function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, []);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.inputArea}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <TextArea
          className={styles.textAreaRounded}
          ref={(node) => {
            const el =
              (node as any)?.resizableTextArea?.textArea ||
              (node as unknown as HTMLTextAreaElement | null);
            textareaRef.current = el ?? null;
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write your question"
          autoSize={{ minRows: 2, maxRows: 6 }}
          disabled={disabled}
        />
        <button
          aria-label="Send"
          className={styles.sendIconBtn}
          onClick={handleSend}
          disabled={disabled}
          title="Send"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22 2L11 13"
              stroke="#374151"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M22 2L15 22L11 13L2 9L22 2Z"
              stroke="#374151"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className={styles.footerNote}>
        GraphX may produce inaccurate information
      </div>
    </div>
  );
}
