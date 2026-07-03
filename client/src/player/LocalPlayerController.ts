import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { TILE_SIZE } from "../config/map";
import type { EquipmentState } from "../game/equipment";
import type { Facing, MoveAck, Position } from "@onyx/shared/protocol";
import { WorldLabelOverlay } from "../ui/WorldLabelOverlay";
import { EquipmentOverlayRenderer } from "./EquipmentOverlayRenderer";
import { PLAYER_SPRITE_KEY } from "./playerAssets";

interface PredictedMove extends Position {
  seq: number;
}

const NAME_LABEL_FONT_SIZE = 13;
const DAMAGE_LABEL_FONT_SIZE = 11;
const DAMAGE_LABEL_FLOAT_DISTANCE = 14;
const DAMAGE_LABEL_DURATION_MS = 620;
const LOCAL_MOVE_DURATION_MS = 120;
const MAX_QUEUED_DIRECTIONS = 3;
const DEATH_FADE_DELAY_MS = 800;
const DEATH_FADE_DURATION_MS = 900;

const DIRECTION_VECTORS: Record<Facing, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export class LocalPlayerController {
  readonly container: Phaser.GameObjects.Container;

  private sprite: Phaser.GameObjects.Image;
  private tileX: number;
  private tileY: number;
  private facing: Facing;
  private moving = false;
  private queuedDirections: Facing[] = [];
  private nextMoveSeq = 1;
  private pendingMoves: PredictedMove[] = [];
  private inputLocked = false;
  private hitFeedbackTimer: Phaser.Time.TimerEvent | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: Record<Facing, Phaser.Input.Keyboard.Key>;
  private equipmentOverlays: EquipmentOverlayRenderer;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    private map: Phaser.Tilemaps.Tilemap,
    private collisionLayer: Phaser.Tilemaps.TilemapLayer | null,
    private obstacleLayer: Phaser.Tilemaps.TilemapLayer | null,
    private labelOverlay: WorldLabelOverlay,
    username: string,
    startPosition: Position,
    private isDynamicTileBlocked: (tileX: number, tileY: number) => boolean = () => false,
  ) {
    this.tileX = startPosition.tileX;
    this.tileY = startPosition.tileY;
    this.facing = startPosition.facing;

    this.sprite = this.scene.add.image(0, 0, PLAYER_SPRITE_KEY);
    this.container = this.scene.add.container(0, 0, [this.sprite]).setDepth(20);
    this.equipmentOverlays = new EquipmentOverlayRenderer(this.scene, this.container);
    this.syncContainerToTile();

    labelOverlay.addLabel({
      target: this.container,
      text: username,
      offsetY: -TILE_SIZE / 2 - 2,
      color: "#ffffff",
      fontSize: NAME_LABEL_FONT_SIZE,
      className: "world-label-name",
    });

    this.cursors = this.scene.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  update(inputBlocked: boolean) {
    if (this.inputLocked) return;
    if (inputBlocked) return;

    const pressedDirection = this.readPressedDirection();
    const direction = pressedDirection ?? this.readHeldDirection();

    if (this.moving) {
      if (pressedDirection) this.queueDirection(pressedDirection);
      return;
    }

    if (!direction) return;

    this.startMove(direction);
  }

  handleMoveAck(ack: MoveAck | Position) {
    if (this.inputLocked) return;

    const normalizedAck = this.normalizeMoveAck(ack);
    if (!normalizedAck) return;

    this.reconcileMoveAck(normalizedAck);
  }

  getTilePosition() {
    return {
      tileX: this.tileX,
      tileY: this.tileY,
    };
  }

  isMoving() {
    return this.moving;
  }

  setEquipment(equipment: EquipmentState) {
    this.equipmentOverlays.setEquipment(equipment);
  }

  playHitFeedback(damage: number) {
    if (this.inputLocked) return;

    this.hitFeedbackTimer?.remove(false);
    this.sprite.setTintFill(0xff6b3d);
    this.hitFeedbackTimer = this.scene.time.delayedCall(110, () => {
      this.sprite.clearTint();
      this.hitFeedbackTimer = null;
    });
    this.showFloatingDamage(damage);
  }

  playDeathFade() {
    this.inputLocked = true;
    this.moving = false;
    this.queuedDirections = [];
    this.pendingMoves = [];
    this.hitFeedbackTimer?.remove(false);
    this.hitFeedbackTimer = null;
    this.scene.tweens.killTweensOf(this.container);
    this.sprite.clearTint();
    this.equipmentOverlays.fadeOut(DEATH_FADE_DELAY_MS, DEATH_FADE_DURATION_MS);

    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      delay: DEATH_FADE_DELAY_MS,
      duration: DEATH_FADE_DURATION_MS,
      ease: "Sine.easeInOut",
    });
  }

  private readPressedDirection(): Facing | null {
    const justDown = Phaser.Input.Keyboard.JustDown;

    if (justDown(this.cursors.up) || justDown(this.wasd.up)) return "up";
    if (justDown(this.cursors.down) || justDown(this.wasd.down)) return "down";
    if (justDown(this.cursors.left) || justDown(this.wasd.left)) return "left";
    if (justDown(this.cursors.right) || justDown(this.wasd.right)) return "right";

    return null;
  }

  private readHeldDirection(): Facing | null {
    if (this.cursors.up.isDown || this.wasd.up.isDown) return "up";
    if (this.cursors.down.isDown || this.wasd.down.isDown) return "down";
    if (this.cursors.left.isDown || this.wasd.left.isDown) return "left";
    if (this.cursors.right.isDown || this.wasd.right.isDown) return "right";

    return null;
  }

  private queueDirection(direction: Facing) {
    if (this.queuedDirections.length >= MAX_QUEUED_DIRECTIONS) {
      this.queuedDirections.shift();
    }
    this.queuedDirections.push(direction);
  }

  private startMove(newFacing: Facing) {
    this.facing = newFacing;

    const { dx, dy } = DIRECTION_VECTORS[newFacing];
    const nextX = this.tileX + dx;
    const nextY = this.tileY + dy;

    if (
      nextX < 0 ||
      nextX >= this.map.width ||
      nextY < 0 ||
      nextY >= this.map.height ||
      this.collisionLayer?.hasTileAt(nextX, nextY) ||
      this.obstacleLayer?.hasTileAt(nextX, nextY) ||
      this.isDynamicTileBlocked(nextX, nextY)
    ) {
      this.bump(dx, dy);
      return;
    }

    this.moving = true;
    this.tileX = nextX;
    this.tileY = nextY;

    const predictedMove: PredictedMove = {
      seq: this.nextMoveSeq++,
      tileX: nextX,
      tileY: nextY,
      facing: newFacing,
    };
    this.pendingMoves.push(predictedMove);

    this.scene.tweens.add({
      targets: this.container,
      x: nextX * TILE_SIZE + TILE_SIZE / 2,
      y: nextY * TILE_SIZE + TILE_SIZE / 2,
      duration: LOCAL_MOVE_DURATION_MS,
      ease: "Linear",
      onComplete: () => {
        this.moving = false;
        this.tryQueuedMove();
      },
    });

    this.socket.emit("move", predictedMove);
  }

  private bump(dx: number, dy: number) {
    const originX = this.tileX * TILE_SIZE + TILE_SIZE / 2;
    const originY = this.tileY * TILE_SIZE + TILE_SIZE / 2;
    this.moving = true;
    this.scene.tweens.add({
      targets: this.container,
      x: originX + dx * 3,
      y: originY + dy * 3,
      duration: 60,
      ease: "Power1",
      yoyo: true,
      onComplete: () => {
        this.moving = false;
        this.tryQueuedMove();
      },
    });
  }

  private tryQueuedMove() {
    if (this.moving) return;

    const direction = this.queuedDirections.shift() ?? this.readHeldDirection();
    if (!direction) return;

    this.startMove(direction);
  }

  private normalizeMoveAck(ack: MoveAck | Position): MoveAck | null {
    if ("position" in ack) return ack;

    const matchingMove = this.pendingMoves.find(move => move.tileX === ack.tileX && move.tileY === ack.tileY);
    if (!matchingMove) return null;

    return {
      seq: matchingMove.seq,
      position: ack,
    };
  }

  private reconcileMoveAck(ack: MoveAck) {
    const acknowledgedMove = this.pendingMoves.find(move => move.seq === ack.seq);
    this.pendingMoves = this.pendingMoves.filter(move => move.seq > ack.seq);

    if (
      acknowledgedMove &&
      (ack.position.tileX !== acknowledgedMove.tileX ||
        ack.position.tileY !== acknowledgedMove.tileY ||
        ack.position.facing !== acknowledgedMove.facing)
    ) {
      this.correctPosition(ack.position);
      return;
    }

    this.facing = ack.position.facing;
  }

  private correctPosition(position: Position) {
    this.scene.tweens.killTweensOf(this.container);
    this.tileX = position.tileX;
    this.tileY = position.tileY;
    this.facing = position.facing;
    this.moving = false;
    this.queuedDirections = [];
    this.pendingMoves = [];
    this.syncContainerToTile();
  }

  private syncContainerToTile() {
    this.container.setPosition(
      this.tileX * TILE_SIZE + TILE_SIZE / 2,
      this.tileY * TILE_SIZE + TILE_SIZE / 2,
    );
  }

  private showFloatingDamage(damage: number) {
    this.labelOverlay.addFloatingLabel({
      target: this.container,
      text: `-${Math.max(1, Math.floor(damage))}`,
      offsetY: -TILE_SIZE,
      color: "#ff735c",
      fontSize: DAMAGE_LABEL_FONT_SIZE,
      className: "world-label-damage",
      floatDistance: DAMAGE_LABEL_FLOAT_DISTANCE,
      durationMs: DAMAGE_LABEL_DURATION_MS,
    });
  }
}
