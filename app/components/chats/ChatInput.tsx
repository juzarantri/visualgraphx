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
    <div className={styles.inputRow}>
      <TextArea
        ref={(node) => {
          const el =
            (node as any)?.resizableTextArea?.textArea ||
            (node as unknown as HTMLTextAreaElement | null);
          textareaRef.current = el ?? null;
        }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Type a message — press Ctrl+Enter to send"
        autoSize={{ minRows: 2, maxRows: 6 }}
        disabled={disabled}
      />

      <div className={styles.sendWrap}>
        <Button
          type="primary"
          onClick={handleSend}
          loading={disabled}
          disabled={disabled}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
