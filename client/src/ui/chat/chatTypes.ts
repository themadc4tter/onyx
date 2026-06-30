export type ChatChannel = "zone" | "world";
export type ChatMessageChannel = ChatChannel | "system";

export interface ChatMessage {
  id: string;
  channel: ChatMessageChannel;
  username: string;
  text: string;
  sentAt: string;
}

