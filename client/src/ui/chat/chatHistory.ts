import type { ChatMessage } from "@onyx/shared/protocol";

export const MAX_CHAT_MESSAGES = 80;

const chatHistory: ChatMessage[] = [];

export function getChatHistory() {
  return chatHistory;
}

export function hasChatHistory() {
  return chatHistory.length > 0;
}

export function pushChatMessage(message: ChatMessage) {
  chatHistory.push(message);
  while (chatHistory.length > MAX_CHAT_MESSAGES) {
    chatHistory.shift();
  }
}
