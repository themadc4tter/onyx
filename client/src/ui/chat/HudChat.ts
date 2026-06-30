import type { Socket } from "socket.io-client";
import { parseChatInput } from "./chatCommands";
import { getChatHistory, hasChatHistory, MAX_CHAT_MESSAGES, pushChatMessage } from "./chatHistory";
import type { ChatChannel, ChatMessage } from "./chatTypes";

export class HudChat {
  readonly element: HTMLElement;

  private chatChannel: ChatChannel = "zone";
  private chatInput: HTMLInputElement;
  private chatLog: HTMLDivElement;
  private chatSelect: HTMLSelectElement;

  constructor(private socket: Socket) {
    this.element = this.createElement();
    this.chatLog = this.element.querySelector<HTMLDivElement>(".hud-chat-log")!;
    this.chatInput = this.element.querySelector<HTMLInputElement>(".hud-chat-input")!;
    this.chatSelect = this.element.querySelector<HTMLSelectElement>(".hud-chat-channel")!;

    this.bindDomEvents();
    this.renderHistory();
    if (!hasChatHistory()) {
      this.addSystemMessage("Welcome to Onyx.");
    }

    this.socket.on("chat:message", this.handleChatMessage);
    this.socket.on("chat:error", this.handleChatError);
  }

  destroy() {
    this.socket.off("chat:message", this.handleChatMessage);
    this.socket.off("chat:error", this.handleChatError);
    this.element.remove();
  }

  focusInput() {
    this.chatInput.focus();
  }

  isFocused() {
    return document.activeElement === this.chatInput;
  }

  private createElement() {
    const chat = document.createElement("section");
    chat.className = "hud-chat";
    chat.setAttribute("aria-label", "Chat");
    chat.innerHTML = `
      <div class="hud-chat-log" aria-live="polite"></div>
      <div class="hud-chat-controls">
        <select class="hud-chat-channel" aria-label="Chat channel">
          <option value="zone">Zone</option>
          <option value="world">World</option>
        </select>
        <input class="hud-chat-input" type="text" placeholder="Message Zone" maxlength="240" />
      </div>
    `;

    return chat;
  }

  private bindDomEvents() {
    this.chatSelect.addEventListener("change", () => {
      this.chatChannel = this.chatSelect.value as ChatChannel;
      this.updatePlaceholder();
      this.chatInput.focus();
    });
    this.chatSelect.addEventListener("keydown", (event) => event.stopPropagation());
    this.chatInput.addEventListener("keydown", this.handleInputKeyDown);
  }

  private handleInputKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();

    if (event.key === "Escape") {
      event.preventDefault();
      this.chatInput.blur();
      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    const rawText = this.chatInput.value.trim();
    if (!rawText) {
      this.chatInput.blur();
      return;
    }

    this.send(rawText);
    this.chatInput.value = "";
  };

  private send(rawText: string) {
    const parsed = parseChatInput(rawText, this.chatChannel);

    if (parsed.kind === "system-message") {
      this.addSystemMessage(parsed.text);
      return;
    }

    if (parsed.kind === "switch-channel") {
      this.setChannel(parsed.channel);
      return;
    }

    this.socket.emit("chat:send", {
      channel: parsed.channel,
      text: parsed.text,
    });
    this.chatInput.blur();
  }

  private setChannel(channel: ChatChannel) {
    this.chatChannel = channel;
    this.chatSelect.value = channel;
    this.updatePlaceholder();
    this.addSystemMessage(`Chat channel set to ${this.getChannelLabel(channel)}.`);
  }

  private updatePlaceholder() {
    this.chatInput.placeholder = `Message ${this.getChannelLabel(this.chatChannel)}`;
  }

  private handleChatMessage = (message: ChatMessage) => {
    this.addMessage(message);
  };

  private handleChatError = (payload: { message?: string }) => {
    this.addSystemMessage(payload.message ?? "Message could not be sent.");
  };

  private addSystemMessage(text: string) {
    this.addMessage({
      id: `system-${Date.now()}-${Math.random()}`,
      channel: "system",
      username: "System",
      text,
      sentAt: new Date().toISOString(),
    });
  }

  private renderHistory() {
    for (const message of getChatHistory()) {
      this.addMessage(message, false);
    }
  }

  private addMessage(message: ChatMessage, persist = true) {
    if (persist) {
      pushChatMessage(message);
    }

    const line = document.createElement("div");
    line.className = `hud-chat-line ${message.channel}`;

    if (message.channel === "system") {
      line.textContent = message.text;
    } else {
      const channel = document.createElement("span");
      channel.className = "chat-channel";
      channel.textContent = `[${this.getChannelLabel(message.channel)}] `;

      const author = document.createElement("span");
      author.className = "chat-author";
      author.textContent = `${message.username}: `;

      const text = document.createElement("span");
      text.textContent = message.text;

      line.append(channel, author, text);
    }

    this.chatLog.appendChild(line);

    while (this.chatLog.childElementCount > MAX_CHAT_MESSAGES) {
      this.chatLog.firstElementChild?.remove();
    }

    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  private getChannelLabel(channel: ChatChannel) {
    const labels: Record<ChatChannel, string> = {
      zone: "Zone",
      world: "World",
    };
    return labels[channel];
  }
}

