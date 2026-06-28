import Phaser from "phaser";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  create() {
    this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2 - 20,
        "Connecting to server...",
        { color: "#ffffff", fontSize: "16px" }
      )
      .setOrigin(0.5);

    const socket = io(SERVER_URL);

    const statusText = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 20, "", {
        color: "#aaaaaa",
        fontSize: "14px",
      })
      .setOrigin(0.5);

    socket.on("connect", () => {
      console.log("connected", socket.id);
      statusText.setText(`connected — ${socket.id}`).setColor("#00ff88");
    });

    socket.on("disconnect", () => {
      console.log("disconnected");
      statusText.setText("disconnected").setColor("#ff4444");
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1a1a2e",
  scene: [BootScene],
});
