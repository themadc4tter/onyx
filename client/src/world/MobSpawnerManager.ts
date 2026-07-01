import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { getMobDefinition, MOB_DEFINITIONS } from "@onyx/shared/mobs";
import type { MobSpawnState, MobStatePayload } from "@onyx/shared/protocol";
import { TILE_SIZE } from "../config/map";
import { WorldLabelOverlay, type WorldLabelHandle } from "../ui/WorldLabelOverlay";
import { AutoAttackSlashEffect } from "./AutoAttackSlashEffect";

interface RenderedMob extends MobSpawnState {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  hpFill: Phaser.GameObjects.Rectangle;
  selection: Phaser.GameObjects.Graphics;
  nameLabel: WorldLabelHandle;
}

export interface MobTargetProfile {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
}

interface MobSpawnerManagerOptions {
  initialStates?: MobSpawnState[];
  onTargetChanged?: (target: MobTargetProfile | null) => void;
  getLocalTilePosition?: () => { tileX: number; tileY: number };
  getLocalWorldPosition?: () => { x: number; y: number };
  isLocalPlayerMoving?: () => boolean;
}

const MOB_DEPTH = 17;
const HP_BAR_WIDTH = 18;
const HP_BAR_HEIGHT = 3;
const AUTO_ATTACK_WINDUP_MS = 1_000;
const AUTO_ATTACK_RANGE_TILES = 1;
const TARGET_RETICLE_CORE_COLOR = 0xffe08a;
const TARGET_RETICLE_GLOW_START = 0xffb84a;
const TARGET_RETICLE_GLOW_END = 0xfff0bc;
const AUTO_ATTACK_RETICLE_CORE_COLOR = 0xff8a2a;
const AUTO_ATTACK_RETICLE_GLOW_START = 0xff6a1f;
const AUTO_ATTACK_RETICLE_GLOW_END = 0xff2f2f;
const TARGET_RETICLE_SIZE = TILE_SIZE + 1;
const TARGET_RETICLE_CORNER_LENGTH = 5;
const TARGET_RETICLE_PULSE_MS = 1_400;
const TARGET_RETICLE_GLOW_WIDTH = 2;
const TARGET_RETICLE_CORE_WIDTH = 1;

export const MOB_SPRITE_ASSETS = Object.values(MOB_DEFINITIONS).map(mob => ({
  key: mob.spriteKey,
  url: mob.spriteUrl,
}));

export class MobSpawnerManager {
  private testDamageKey: Phaser.Input.Keyboard.Key;
  private mobs = new Map<string, RenderedMob>();
  private selectedMobId: string | null = null;
  private onTargetChanged: (target: MobTargetProfile | null) => void;
  private getLocalTilePosition: () => { tileX: number; tileY: number } | null;
  private getLocalWorldPosition: () => { x: number; y: number } | null;
  private isLocalPlayerMoving: () => boolean;
  private slashEffect: AutoAttackSlashEffect;
  private autoAttackEnabled = false;
  private windupStartedAt: number | null = null;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    private labelOverlay: WorldLabelOverlay,
    options: MobSpawnerManagerOptions = {},
  ) {
    this.onTargetChanged = options.onTargetChanged ?? (() => {});
    this.getLocalTilePosition = options.getLocalTilePosition ?? (() => null);
    this.getLocalWorldPosition = options.getLocalWorldPosition ?? (() => null);
    this.isLocalPlayerMoving = options.isLocalPlayerMoving ?? (() => false);
    this.slashEffect = new AutoAttackSlashEffect(this.scene);
    this.testDamageKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.createMobs(options.initialStates ?? []);
    this.bindServerEvents();
  }

  update(inputBlocked: boolean) {
    if (!inputBlocked && Phaser.Input.Keyboard.JustDown(this.testDamageKey)) {
      this.toggleAutoAttack();
    }

    this.updateAutoAttack();
    this.updateSelectedReticle();
  }

  clearTarget() {
    if (!this.selectedMobId) return;

    this.disableAutoAttack();
    this.selectedMobId = null;
    this.onTargetChanged(null);
    this.refreshMobVisuals();
  }

  private createMobs(states: MobSpawnState[]) {
    for (const state of states) {
      this.createMob(state);
    }
  }

  private createMob(state: MobSpawnState) {
    const definition = getMobDefinition(state.mobId);
    if (!definition || this.mobs.has(state.id)) return null;

    const selection = this.scene.add.graphics().setVisible(false);
    const sprite = this.scene.add.image(0, 0, definition.spriteKey);
    const hpBackground = this.scene.add
      .rectangle(-HP_BAR_WIDTH / 2, -TILE_SIZE / 2 - 5, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x391616)
      .setOrigin(0, 0.5);
    const hpFill = this.scene.add
      .rectangle(-HP_BAR_WIDTH / 2, -TILE_SIZE / 2 - 5, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0xc94f4f)
      .setOrigin(0, 0.5);

    const container = this.scene.add
      .container(
        state.tileX * TILE_SIZE + TILE_SIZE / 2,
        state.tileY * TILE_SIZE + TILE_SIZE / 2,
        [selection, sprite, hpBackground, hpFill],
      )
      .setDepth(MOB_DEPTH)
      .setVisible(state.alive);
    const nameLabel = this.labelOverlay.addLabel({
      target: container,
      text: definition.name,
      offsetY: -TILE_SIZE / 2 - 7,
      color: "#ffffff",
      fontSize: 13,
      className: "world-label-name",
    });
    nameLabel.setVisible(state.alive);

    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => this.selectMob(state.id));

    const mob: RenderedMob = {
      ...state,
      container,
      sprite,
      hpFill,
      selection,
      nameLabel,
    };
    this.mobs.set(state.id, mob);
    this.updateMobVisuals(mob);
    return mob;
  }

  private bindServerEvents() {
    this.socket.on("mob:state", this.handleMobState);
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  private handleMobState = (state: MobStatePayload) => {
    const mob = this.mobs.get(state.id) ?? this.createMob(state);
    if (!mob) return;

    const wasAlive = mob.alive;
    Object.assign(mob, state);
    this.updateMobVisuals(mob);

    if (wasAlive && !state.alive) {
      if (this.selectedMobId === state.id) {
        this.clearTarget();
      }
      this.scene.tweens.add({
        targets: mob.container,
        alpha: 0,
        duration: 200,
        ease: "Sine.easeOut",
        onComplete: () => mob.container.setVisible(false),
      });
      return;
    }

    if (!wasAlive && state.alive) {
      mob.container.setAlpha(0).setVisible(true);
      this.scene.tweens.add({
        targets: mob.container,
        alpha: 1,
        duration: 250,
        ease: "Sine.easeOut",
      });
    }

    if (state.alive && this.selectedMobId === state.id) {
      this.emitSelectedTarget();
    }
  };

  private handlePointerDown = (_pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
    if (gameObjects.length > 0) return;
    this.clearTarget();
  };

  private toggleAutoAttack() {
    if (this.autoAttackEnabled) {
      this.disableAutoAttack();
      return;
    }

    const target = this.getSelectedAliveMob();
    if (!target) return;

    this.autoAttackEnabled = true;
    this.updateMobVisuals(target);
  }

  private disableAutoAttack() {
    if (!this.autoAttackEnabled && this.windupStartedAt === null) return;

    this.autoAttackEnabled = false;
    this.windupStartedAt = null;
    this.refreshMobVisuals();
  }

  private updateAutoAttack() {
    if (!this.autoAttackEnabled) return;

    const target = this.getSelectedAliveMob();
    if (!target) {
      this.disableAutoAttack();
      return;
    }

    if (this.isLocalPlayerMoving()) {
      this.windupStartedAt = null;
      return;
    }

    if (this.windupStartedAt !== null) {
      if (this.scene.time.now - this.windupStartedAt < AUTO_ATTACK_WINDUP_MS) return;

      this.performAutoAttack(target);
      this.windupStartedAt = null;
      return;
    }

    if (!this.isTargetInAutoAttackRange(target)) return;

    this.windupStartedAt = this.scene.time.now;
  }

  private performAutoAttack(target: RenderedMob) {
    if (!target.alive || !this.isTargetInAutoAttackRange(target)) return;

    const origin = this.getLocalWorldPosition();
    if (origin) {
      this.slashEffect.play(
        new Phaser.Math.Vector2(origin.x, origin.y),
        new Phaser.Math.Vector2(target.container.x, target.container.y),
      );
    }

    this.socket.emit("mob:testDamage", { id: target.id });
  }

  private isTargetInAutoAttackRange(target: RenderedMob) {
    const position = this.getLocalTilePosition();
    if (!position) return false;

    return (
      Math.abs(position.tileX - target.tileX) <= AUTO_ATTACK_RANGE_TILES &&
      Math.abs(position.tileY - target.tileY) <= AUTO_ATTACK_RANGE_TILES
    );
  }

  private updateMobVisuals(mob: RenderedMob) {
    const hpRatio = mob.maxHp > 0 ? Phaser.Math.Clamp(mob.hp / mob.maxHp, 0, 1) : 0;
    mob.hpFill.setDisplaySize(Math.max(0.1, HP_BAR_WIDTH * hpRatio), HP_BAR_HEIGHT);
    const isSelected = mob.alive && this.selectedMobId === mob.id;
    mob.selection.setVisible(isSelected);
    if (isSelected) this.drawTargetReticle(mob.selection);
    mob.nameLabel.setVisible(mob.alive);
  }

  private updateSelectedReticle() {
    const mob = this.getSelectedAliveMob();
    if (!mob) return;

    this.drawTargetReticle(mob.selection);
  }

  private drawTargetReticle(reticle: Phaser.GameObjects.Graphics) {
    const pulse = (Math.sin((this.scene.time.now / TARGET_RETICLE_PULSE_MS) * Math.PI * 2) + 1) / 2;
    const glowColor = this.autoAttackEnabled
      ? this.interpolateColor(AUTO_ATTACK_RETICLE_GLOW_START, AUTO_ATTACK_RETICLE_GLOW_END, pulse)
      : this.interpolateColor(TARGET_RETICLE_GLOW_START, TARGET_RETICLE_GLOW_END, pulse);
    const coreColor = this.autoAttackEnabled ? AUTO_ATTACK_RETICLE_CORE_COLOR : TARGET_RETICLE_CORE_COLOR;
    const glowAlpha = this.autoAttackEnabled
      ? Phaser.Math.Linear(0.36, 0.72, pulse)
      : Phaser.Math.Linear(0.24, 0.5, pulse);

    reticle.clear();
    this.strokeTargetReticle(reticle, TARGET_RETICLE_GLOW_WIDTH, glowColor, glowAlpha);
    this.strokeTargetReticle(reticle, TARGET_RETICLE_CORE_WIDTH, coreColor, 0.96);
  }

  private strokeTargetReticle(reticle: Phaser.GameObjects.Graphics, lineWidth: number, color: number, alpha: number) {
    const halfSize = TARGET_RETICLE_SIZE / 2;
    const cornerLength = TARGET_RETICLE_CORNER_LENGTH;
    const left = -halfSize;
    const right = halfSize;
    const top = -halfSize;
    const bottom = halfSize;

    reticle.lineStyle(lineWidth, color, alpha);
    reticle.beginPath();
    reticle.moveTo(left, top + cornerLength);
    reticle.lineTo(left, top);
    reticle.lineTo(left + cornerLength, top);
    reticle.moveTo(right - cornerLength, top);
    reticle.lineTo(right, top);
    reticle.lineTo(right, top + cornerLength);
    reticle.moveTo(right, bottom - cornerLength);
    reticle.lineTo(right, bottom);
    reticle.lineTo(right - cornerLength, bottom);
    reticle.moveTo(left + cornerLength, bottom);
    reticle.lineTo(left, bottom);
    reticle.lineTo(left, bottom - cornerLength);
    reticle.strokePath();
  }

  private interpolateColor(from: number, to: number, progress: number) {
    const inverseProgress = 1 - progress;
    const red = Math.round(((from >> 16) & 0xff) * inverseProgress + ((to >> 16) & 0xff) * progress);
    const green = Math.round(((from >> 8) & 0xff) * inverseProgress + ((to >> 8) & 0xff) * progress);
    const blue = Math.round((from & 0xff) * inverseProgress + (to & 0xff) * progress);

    return Phaser.Display.Color.GetColor(red, green, blue);
  }

  private refreshMobVisuals() {
    for (const renderedMob of this.mobs.values()) {
      this.updateMobVisuals(renderedMob);
    }
  }

  private selectMob(mobId: string) {
    const mob = this.mobs.get(mobId);
    if (!mob?.alive) return;

    this.selectedMobId = mobId;
    this.emitSelectedTarget();
    this.refreshMobVisuals();
  }

  private emitSelectedTarget() {
    const target = this.getSelectedAliveMob();
    if (!target) {
      this.onTargetChanged(null);
      return;
    }

    const definition = getMobDefinition(target.mobId);
    this.onTargetChanged({
      id: target.id,
      name: definition?.name ?? target.mobId,
      hp: target.hp,
      maxHp: target.maxHp,
    });
  }

  private getSelectedAliveMob() {
    return this.selectedMobId ? this.getAliveMob(this.selectedMobId) : null;
  }

  private getAliveMob(mobId: string) {
    const mob = this.mobs.get(mobId);
    return mob?.alive ? mob : null;
  }

  private destroy = () => {
    this.socket.off("mob:state", this.handleMobState);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    for (const mob of this.mobs.values()) {
      mob.nameLabel.destroy();
      mob.container.destroy(true);
    }
    this.mobs.clear();
  };
}
