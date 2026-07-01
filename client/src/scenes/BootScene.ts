import Phaser from "phaser";
import { io, Socket } from "socket.io-client";
import { supabase } from "../lib/supabase";
import type { ProfilePayload, RemotePlayerData } from "@onyx/shared/protocol";

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string) ?? "http://localhost:3001";

export class BootScene extends Phaser.Scene {
  private socket!: Socket;
  private logoutBtn!: HTMLButtonElement;

  constructor() {
    super({ key: "BootScene" });
  }

  async create() {
    const { data: { session } } = await supabase.auth.getSession();

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
      reconnection: false,
    });

    // Buffer remote players that arrive before GameScene is ready to listen.
    // players:init fires immediately on connect; player:joined can fire during
    // the 600ms delayedCall before GameScene registers its own listener.
    const remoteBuffer: RemotePlayerData[] = [];
    const onPlayersInit = (players: RemotePlayerData[]) => remoteBuffer.push(...players);
    const onPlayerJoined = (p: RemotePlayerData) => remoteBuffer.push(p);
    this.socket.on("players:init", onPlayersInit);
    this.socket.on("player:joined", onPlayerJoined);

    this.socket.on("connect", () => {
      console.log("connected", this.socket.id);
      statusText.setText("Connected — entering world...").setColor("#00ff88");
    });

    this.socket.on("profile", (data: ProfilePayload) => {
      this.addLogoutButton();

      this.time.delayedCall(600, () => {
        this.socket.removeAllListeners();
        this.scene.start("GameScene", {
          socket: this.socket,
          profile: data.profile,
          initPlayers: remoteBuffer,
          zoneId: data.zoneId,
          startPos: data.position,
          herbSpawns: data.herbSpawns ?? [],
          mobSpawns: data.mobSpawns ?? [],
          inventory: data.inventory,
          equipment: data.equipment,
        });
      });
    });

    this.socket.on("connect_error", (err) => {
      console.error("connect_error", err.message);
      statusText.setText(`Connection rejected: ${err.message}`).setColor("#ff4444");
    });

    this.socket.on("error", (code: string) => {
      if (code === "server_full") {
        statusText.setText("Server is full (50/50) — try again later.").setColor("#ff4444");
      }
    });

    this.socket.on("disconnect", async () => {
      statusText.setText("Connection lost — returning to menu...").setColor("#ff4444");
      this.logoutBtn?.remove();
      await supabase.auth.signOut();
      setTimeout(() => window.location.reload(), 3000);
    });
  }

  private addLogoutButton() {
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
