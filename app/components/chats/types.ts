export type Role = "user" | "assistant" | "system";
export type ChatMessage = {
  role: Role;
  content: string;
  // ISO timestamps
  // `sent_at` is set for user messages when the user sends them.
  sent_at?: string;
  // `received_at` is set for assistant messages when the assistant's streaming completes.
  received_at?: string;
};
