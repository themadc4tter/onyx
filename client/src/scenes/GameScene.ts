import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { MAP_DATA, MAP_COLS, MAP_ROWS, SPAWN, TILE, TILE_SIZE } from "../config/map";
import type { Facing, Position, RemotePlayerData } from "../types";
import { supabase } from "../lib/supabase";

interface Profile {
  id: string;
  username: string;
}

interface RemotePlayerState {
  container: Phaser.GameObjects.Container;
  graphic: Phaser.GameObjects.Graphics;
  tileX: number;
  tileY: number;
}

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private profile!: Profile;
  private initPlayers: RemotePlayerData[] = [];

  private tileX: number = SPAWN.x;
  private tileY: number = SPAWN.y;
  private facing: Facing = "down";
  private moving = false;

  private playerGraphic!: Phaser.GameObjects.Graphics;
  private playerContainer!: Phaser.GameObjects.Container;

  private remotePlayers = new Map<string, RemotePlayerState>();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<Facing, Phaser.Input.Keyboard.Key>;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { socket: Socket; profile: Profile; initPlayers: RemotePlayerData[] }) {
    this.socket = data.socket;
    this.profile = data.profile;
    this.initPlayers = data.initPlayers ?? [];
  }

  create() {
    this.buildTilesetTexture();
    this.buildTilemap();
    this.buildPlayer();
    this.setupCamera();
    this.setupInput();
    this.setupServerEvents();

    // Populate players that were already online (buffered by BootScene).
    for (const p of this.initPlayers) this.addRemotePlayer(p);
  }

  // ─── Tileset ────────────────────────────────────────────────────────────────

  private buildTilesetTexture() {
    const S = TILE_SIZE;
    const ct = this.textures.createCanvas("tileset", S * 3, S)!;
    const ctx = ct.getContext();

    // Tile 0 — grass
    ctx.fillStyle = "#3d7a3d";
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#4a8c4a";
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(i * 5 + 2, (i % 3) * 7 + 4, 2, 4);
    }

    // Tile 1 — dirt path
    ctx.fillStyle = "#9e7e56";
    ctx.fillRect(S, 0, S, S);
    ctx.fillStyle = "#8b6f47";
    ctx.fillRect(S + 3, 3, S - 6, S - 6);

    // Tile 2 — tree/wall
    ctx.fillStyle = "#2d5a1b";
    ctx.fillRect(S * 2, 0, S, S);
    ctx.fillStyle = "#1e3f12";
    ctx.fillRect(S * 2 + 4, 2, S - 8, S - 12);
    ctx.fillStyle = "#5c3a1e";
    ctx.fillRect(S * 2 + 12, S - 10, 8, 10);

    ct!.refresh();
  }

  // ─── Tilemap ────────────────────────────────────────────────────────────────

  private buildTilemap() {
    const map = this.make.tilemap({
      data: MAP_DATA,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });

    const tileset = map.addTilesetImage("tileset", "tileset", TILE_SIZE, TILE_SIZE, 0, 0)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollision([TILE.WALL]);
  }

  // ─── Local player ───────────────────────────────────────────────────────────

  private buildPlayer() {
    this.playerGraphic = this.add.graphics();
    this.drawPlayer();

    const label = this.add
      .text(0, -TILE_SIZE / 2 - 2, this.profile.username, {
        fontSize: "10px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1);

    this.playerContainer = this.add.container(0, 0, [this.playerGraphic, label]);
    this.playerContainer.setDepth(2);
    this.syncContainerToTile();
  }

  private drawPlayerGraphic(graphic: Phaser.GameObjects.Graphics, facing: Facing, bodyColor: number) {
    graphic.clear();
    const hs = TILE_SIZE / 2;

    graphic.fillStyle(bodyColor);
    graphic.fillRect(-hs + 4, -hs + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    graphic.fillStyle(0xffffff);
    const pad = 7;
    switch (facing) {
      case "up":    graphic.fillRect(-3, -hs + pad, 6, 4); break;
      case "down":  graphic.fillRect(-3,  hs - pad - 4, 6, 4); break;
      case "left":  graphic.fillRect(-hs + pad, -3, 4, 6); break;
      case "right": graphic.fillRect( hs - pad - 4, -3, 4, 6); break;
    }
  }

  private drawPlayer() {
    this.drawPlayerGraphic(this.playerGraphic, this.facing, 0x4466cc);
  }

  private syncContainerToTile() {
    this.playerContainer.setPosition(
      this.tileX * TILE_SIZE + TILE_SIZE / 2,
      this.tileY * TILE_SIZE + TILE_SIZE / 2
    );
  }

  // ─── Camera ─────────────────────────────────────────────────────────────────

  private setupCamera() {
    const mapWidthPx = MAP_COLS * TILE_SIZE;
    const mapHeightPx = MAP_ROWS * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapWidthPx, mapHeightPx);
    this.cameras.main.startFollow(this.playerContainer, true);
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  private setupInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  // ─── Remote players ─────────────────────────────────────────────────────────

  private addRemotePlayer(data: RemotePlayerData) {
    if (this.remotePlayers.has(data.socketId)) return;

    const graphic = this.add.graphics();
    this.drawPlayerGraphic(graphic, data.position.facing, 0xcc7744);

    const label = this.add
      .text(0, -TILE_SIZE / 2 - 2, data.username, {
        fontSize: "10px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1);

    const container = this.add
      .container(
        data.position.tileX * TILE_SIZE + TILE_SIZE / 2,
        data.position.tileY * TILE_SIZE + TILE_SIZE / 2,
        [graphic, label],
      )
      .setDepth(1);

    this.remotePlayers.set(data.socketId, {
      container,
      graphic,
      tileX: data.position.tileX,
      tileY: data.position.tileY,
    });
  }

  private moveRemotePlayer(socketId: string, tileX: number, tileY: number, facing: Facing) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;

    rp.tileX = tileX;
    rp.tileY = tileY;
    this.drawPlayerGraphic(rp.graphic, facing, 0xcc7744);

    this.tweens.add({
      targets: rp.container,
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: tileY * TILE_SIZE + TILE_SIZE / 2,
      duration: 120,
      ease: "Linear",
    });
  }

  private removeRemotePlayer(socketId: string) {
    const rp = this.remotePlayers.get(socketId);
    if (!rp) return;
    rp.container.destroy(true);
    this.remotePlayers.delete(socketId);
  }

  // ─── Server events ──────────────────────────────────────────────────────────

  private setupServerEvents() {
    this.socket.on("move:ack", (pos: Position) => {
      if (pos.tileX !== this.tileX || pos.tileY !== this.tileY) {
        this.tweens.killTweensOf(this.playerContainer);
        this.tileX = pos.tileX;
        this.tileY = pos.tileY;
        this.syncContainerToTile();
      }
      this.facing = pos.facing;
      this.drawPlayer();
      this.moving = false;
    });

    this.socket.on("player:joined", (data: RemotePlayerData) => {
      this.addRemotePlayer(data);
    });

    this.socket.on("player:moved", (data: { socketId: string; tileX: number; tileY: number; facing: Facing }) => {
      this.moveRemotePlayer(data.socketId, data.tileX, data.tileY, data.facing);
    });

    this.socket.on("player:left", (data: { socketId: string }) => {
      this.removeRemotePlayer(data.socketId);
    });

    // Disconnected (sleep, network drop, server restart) — sign out and return to login.
    this.socket.on("disconnect", async () => {
      await supabase.auth.signOut();
      window.location.reload();
    });
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  update() {
    if (this.moving) return;

    const JD = Phaser.Input.Keyboard.JustDown;
    let dx = 0, dy = 0, newFacing: Facing | null = null;

    if      (JD(this.cursors.up)    || JD(this.wasd.up))    { dy = -1; newFacing = "up"; }
    else if (JD(this.cursors.down)  || JD(this.wasd.down))  { dy =  1; newFacing = "down"; }
    else if (JD(this.cursors.left)  || JD(this.wasd.left))  { dx = -1; newFacing = "left"; }
    else if (JD(this.cursors.right) || JD(this.wasd.right)) { dx =  1; newFacing = "right"; }

    if (!newFacing) return;

    this.facing = newFacing;

    const nextX = this.tileX + dx;
    const nextY = this.tileY + dy;

    if (nextX < 0 || nextX >= MAP_COLS || nextY < 0 || nextY >= MAP_ROWS ||
        MAP_DATA[nextY][nextX] === TILE.WALL) {
      this.drawPlayer();
      return;
    }

    this.moving = true;
    this.tileX = nextX;
    this.tileY = nextY;
    this.drawPlayer();

    const targetX = nextX * TILE_SIZE + TILE_SIZE / 2;
    const targetY = nextY * TILE_SIZE + TILE_SIZE / 2;

    this.tweens.add({
      targets: this.playerContainer,
      x: targetX,
      y: targetY,
      duration: 120,
      ease: "Linear",
      onComplete: () => { this.moving = false; },
    });

    this.socket.emit("move", { tileX: nextX, tileY: nextY, facing: newFacing });
  }
}
