import Phaser from "phaser";
import { io, Socket } from "socket.io-client";
import { supabase } from "../lib/supabase";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) ?? "http://localhost:3001";

interface Profile {
  id: string;
  username: string;
}

export class BootScene extends Phaser.Scene {
  private socket!: Socket;
  private logoutBtn!: HTMLButtonElement;

  constructor() {
    super({ key: "BootScene" });
  }

  async create() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      console.error("BootScene: no session found");
      return;
    }

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    const statusText = this.add
      .text(cx, cy, "Connecting...", { color: "#ffffff", fontSize: "16px" })
      .setOrigin(0.5);

    this.socket = io(SERVER_URL, {
      auth: { token: session.access_token },
    });

    this.socket.on("connect", () => {
      console.log("connected", this.socket.id);
      statusText.setText(`connected — ${this.socket.id}`).setColor("#00ff88");
    });

    this.socket.on("profile", (profile: Profile) => {
      this.add
        .text(cx, cy + 40, `Welcome, ${profile.username}`, {
          color: "#aaaaaa",
          fontSize: "14px",
        })
        .setOrigin(0.5);
    });

    this.socket.on("connect_error", (err) => {
      console.error("connect_error", err.message);
      statusText
        .setText(`Connection rejected: ${err.message}`)
        .setColor("#ff4444");
    });

    this.socket.on("disconnect", () => {
      statusText.setText("disconnected").setColor("#ff4444");
    });

    this.logoutBtn = document.createElement("button");
    this.logoutBtn.textContent = "Logout";
    Object.assign(this.logoutBtn.style, {
      position: "fixed",
      top: "1rem",
      right: "1rem",
      background: "none",
      border: "1px solid #555",
      color: "#aaa",
      fontFamily: "'Courier New', monospace",
      fontSize: "12px",
      letterSpacing: "1px",
      padding: "0.4rem 0.75rem",
      cursor: "pointer",
      textTransform: "uppercase",
      zIndex: "100",
    });
    this.logoutBtn.addEventListener("mouseover", () => {
      this.logoutBtn.style.borderColor = "#ff4444";
      this.logoutBtn.style.color = "#ff4444";
    });
    this.logoutBtn.addEventListener("mouseout", () => {
      this.logoutBtn.style.borderColor = "#555";
      this.logoutBtn.style.color = "#aaa";
    });
    this.logoutBtn.addEventListener("click", () => this.logout());
    document.body.appendChild(this.logoutBtn);
  }

  private async logout() {
    this.socket?.disconnect();
    await supabase.auth.signOut();
    this.logoutBtn?.remove();
    window.location.reload();
  }
}
