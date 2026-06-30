import type { ChatChannel } from "./chatTypes";

export type ParsedChatInput =
  | { kind: "send"; channel: ChatChannel; text: string }
  | { kind: "switch-channel"; channel: ChatChannel }
  | { kind: "system-message"; text: string };

export function parseChatInput(rawText: string, activeChannel: ChatChannel): ParsedChatInput {
  if (!rawText.startsWith("/")) {
    return { kind: "send", channel: activeChannel, text: rawText };
  }

  const [commandWithSlash, ...rest] = rawText.split(/\s+/);
  const command = commandWithSlash.slice(1).toLowerCase();
  const text = rest.join(" ").trim();

  if (command === "z" || command === "zone") {
    return text ? { kind: "send", channel: "zone", text } : { kind: "switch-channel", channel: "zone" };
  }

  if (command === "w" || command === "world") {
    return text ? { kind: "send", channel: "world", text } : { kind: "switch-channel", channel: "world" };
  }

  if (command === "p" || command === "party") {
    return { kind: "system-message", text: "Party chat will be available once the party system exists." };
  }

  return { kind: "system-message", text: `Unknown chat command: /${command}` };
}

