import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { KENNEY_TILES, MAP_COLS, MAP_ROWS, SPAWN, TILE, TILE_SIZE, ZONE_MAPS } from "../config/map";
import type { Facing, Position, RemotePlayerData } from "../types";
import { supabase } from "../lib/supabase";

interface Profile { id: string; username: string; }

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
  private zoneId: string = "town";
  private startPos: Position | null = null;

  private tileX: number = SPAWN.x;
  private tileY: number = SPAWN.y;
  private facing: Facing = "down";
  private moving = false;

  private playerGraphic!: Phaser.GameObjects.Graphics;
  private playerContainer!: Phaser.GameObjects.Container;
  private remotePlayers = new Map<string, RemotePlayerState>();

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<Facing, Phaser.Input.Keyboard.Key>;

  constructor() { super({ key: "GameScene" }); }

  init(data: { socket: Socket; profile: Profile; initPlayers: RemotePlayerData[]; zoneId?: string; startPos?: Position }) {
    this.socket = data.socket;
    this.profile = data.profile;
    this.initPlayers = data.initPlayers ?? [];
    this.zoneId = data.zoneId ?? "town";
    this.startPos = data.startPos ?? null;
    this.remotePlayers = new Map();
    this.moving = false;
  }

  preload() {
    this.load.image("tileset", "assets/roguelikeSheet_transparent.png");
  }

  create() {
    const map = ZONE_MAPS[this.zoneId] ?? ZONE_MAPS["town"];
    this.tileX = this.startPos?.tileX ?? SPAWN.x;
    this.tileY = this.startPos?.tileY ?? SPAWN.y;
    this.facing = this.startPos?.facing ?? "down";

    this.buildTilemap(map);
    this.buildPlayer();
    this.setupCamera();
    this.setupInput();
    this.setupServerEvents();

    for (const p of this.initPlayers) this.addRemotePlayer(p);
  }

  // ─── Tilemap ────────────────────────────────────────────────────────────────

  private buildTilemap(mapData: number[][]) {
    // Transform logical values (0/1/2/3) → Kenney tile indices before creating the tilemap.
    const visualData = mapData.map(row => row.map(v => KENNEY_TILES[v] ?? 0));

    const map = this.make.tilemap({ data: visualData, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    // addTilesetImage(name, key, tileWidth, tileHeight, tileMargin, tileSpacing)
    // Kenney sheet: 16×16 tiles, 0px margin, 1px spacing between tiles.
    map.addTilesetImage("tileset", "tileset", 16, 16, 0, 1)!;
    map.createLayer(0, "tileset", 0, 0)!;
  }

  // ─── Local player ───────────────────────────────────────────────────────────

  private buildPlayer() {
    this.playerGraphic = this.add.graphics();
    this.drawPlayer();

    const label = this.add
      .text(0, -TILE_SIZE / 2 - 2, this.profile.username, {
        fontSize: "8px",
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
    graphic.fillRect(-hs + 2, -hs + 2, TILE_SIZE - 4, TILE_SIZE - 4);

    graphic.fillStyle(0xffffff);
    const pad = 4;
    switch (facing) {
      case "up":    graphic.fillRect(-2, -hs + pad, 4, 2); break;
      case "down":  graphic.fillRect(-2,  hs - pad - 2, 4, 2); break;
      case "left":  graphic.fillRect(-hs + pad, -2, 2, 4); break;
      case "right": graphic.fillRect( hs - pad - 2, -2, 2, 4); break;
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
    const mapWidthPx  = MAP_COLS * TILE_SIZE;
    const mapHeightPx = MAP_ROWS * TILE_SIZE;
    this.cameras.main.setZoom(2);
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
        fontSize: "8px",
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

    this.remotePlayers.set(data.socketId, { container, graphic, tileX: data.position.tileX, tileY: data.position.tileY });
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

    this.socket.on("player:joined", (data: RemotePlayerData) => { this.addRemotePlayer(data); });

    this.socket.on("player:moved", (data: { socketId: string; tileX: number; tileY: number; facing: Facing }) => {
      this.moveRemotePlayer(data.socketId, data.tileX, data.tileY, data.facing);
    });

    this.socket.on("player:left", (data: { socketId: string }) => { this.removeRemotePlayer(data.socketId); });

    this.socket.on("zone:changed", (payload: { zoneId: string; position: Position; initPlayers: RemotePlayerData[] }) => {
      this.socket.removeAllListeners();
      this.scene.restart({
        socket: this.socket,
        profile: this.profile,
        initPlayers: payload.initPlayers,
        zoneId: payload.zoneId,
        startPos: payload.position,
      });
    });

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

    const currentMap = ZONE_MAPS[this.zoneId] ?? ZONE_MAPS["town"];
    if (
      nextX < 0 || nextX >= MAP_COLS ||
      nextY < 0 || nextY >= MAP_ROWS ||
      currentMap[nextY][nextX] === TILE.WALL
    ) {
      this.drawPlayer();
      return;
    }

    this.moving = true;
    this.tileX = nextX;
    this.tileY = nextY;
    this.drawPlayer();

    this.tweens.add({
      targets: this.playerContainer,
      x: nextX * TILE_SIZE + TILE_SIZE / 2,
      y: nextY * TILE_SIZE + TILE_SIZE / 2,
      duration: 120,
      ease: "Linear",
      onComplete: () => { this.moving = false; },
    });

    this.socket.emit("move", { tileX: nextX, tileY: nextY, facing: newFacing });
  }
}
