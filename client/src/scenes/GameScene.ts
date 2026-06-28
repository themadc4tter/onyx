import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { MAP_DATA, MAP_COLS, MAP_ROWS, SPAWN, TILE, TILE_SIZE } from "../config/map";

type Facing = "up" | "down" | "left" | "right";

interface Profile {
  id: string;
  username: string;
}

interface Position {
  tileX: number;
  tileY: number;
  facing: Facing;
}

export class GameScene extends Phaser.Scene {
  private socket!: Socket;
  private profile!: Profile;

  private tileX = SPAWN.x;
  private tileY = SPAWN.y;
  private facing: Facing = "down";
  private moving = false;

  private playerGraphic!: Phaser.GameObjects.Graphics;
  private playerContainer!: Phaser.GameObjects.Container;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<Facing, Phaser.Input.Keyboard.Key>;

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { socket: Socket; profile: Profile }) {
    this.socket = data.socket;
    this.profile = data.profile;
  }

  create() {
    this.buildTilesetTexture();
    this.buildTilemap();
    this.buildPlayer();
    this.setupCamera();
    this.setupInput();
    this.setupServerEvents();
  }

  // ─── Tileset ────────────────────────────────────────────────────────────────

  private buildTilesetTexture() {
    const S = TILE_SIZE;
    const ct = this.textures.createCanvas("tileset", S * 3, S);
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

    ct.refresh();
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

  // ─── Player ─────────────────────────────────────────────────────────────────

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
    this.syncContainerToTile();
  }

  private drawPlayer() {
    const g = this.playerGraphic;
    g.clear();

    const hs = TILE_SIZE / 2;

    // Body
    g.fillStyle(0x4466cc);
    g.fillRect(-hs + 4, -hs + 4, TILE_SIZE - 8, TILE_SIZE - 8);

    // Direction dot
    g.fillStyle(0xffffff);
    const pad = 7;
    switch (this.facing) {
      case "up":    g.fillRect(-3, -hs + pad, 6, 4); break;
      case "down":  g.fillRect(-3,  hs - pad - 4, 6, 4); break;
      case "left":  g.fillRect(-hs + pad, -3, 4, 6); break;
      case "right": g.fillRect( hs - pad - 4, -3, 4, 6); break;
    }
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

  // ─── Server ─────────────────────────────────────────────────────────────────

  private setupServerEvents() {
    this.socket.on("move:ack", (pos: Position) => {
      // Server correction: snap back if server rejected the move
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
  }

  // ─── Update ─────────────────────────────────────────────────────────────────

  update() {
    if (this.moving) return;

    const JD = Phaser.Input.Keyboard.JustDown;
    let dx = 0, dy = 0, newFacing: Facing | null = null;

    if (JD(this.cursors.up)    || JD(this.wasd.up))    { dy = -1; newFacing = "up"; }
    else if (JD(this.cursors.down)  || JD(this.wasd.down))  { dy =  1; newFacing = "down"; }
    else if (JD(this.cursors.left)  || JD(this.wasd.left))  { dx = -1; newFacing = "left"; }
    else if (JD(this.cursors.right) || JD(this.wasd.right)) { dx =  1; newFacing = "right"; }

    if (!newFacing) return;

    this.facing = newFacing;

    const nextX = this.tileX + dx;
    const nextY = this.tileY + dy;

    // Collision — update facing sprite even if blocked
    if (nextX < 0 || nextX >= MAP_COLS || nextY < 0 || nextY >= MAP_ROWS ||
        MAP_DATA[nextY][nextX] === TILE.WALL) {
      this.drawPlayer();
      return;
    }

    // Optimistic move
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
