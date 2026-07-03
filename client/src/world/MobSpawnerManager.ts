import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { getMobDefinition, MOB_DEFINITIONS } from "@onyx/shared/mobs";
import type { MobSpawnState, MobStatePayload } from "@onyx/shared/protocol";
import { TILE_SIZE } from "../config/map";
import type { Targetable } from "./TargetingManager";

interface RenderedMob extends MobSpawnState, Targetable {
  targetType: "mob";
  name: string;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  hpContainer: Phaser.GameObjects.Container;
  hpFill: Phaser.GameObjects.Rectangle;
}

interface MobSpawnerManagerOptions {
  initialStates?: MobSpawnState[];
  onMobClicked?: (mob: Targetable) => void;
  onMobChanged?: (mob: Targetable) => void;
}

const MOB_DEPTH = 17;
const MOB_STATUS_DEPTH = 23;
const HP_BAR_WIDTH = 18;
const HP_BAR_HEIGHT = 3;
const MOB_MOVE_DURATION_MS = 120;

export const MOB_SPRITE_ASSETS = Object.values(MOB_DEFINITIONS).map(mob => ({
  key: mob.spriteKey,
  url: mob.spriteUrl,
}));

export class MobSpawnerManager {
  private mobs = new Map<string, RenderedMob>();
  private onMobClicked: (mob: Targetable) => void;
  private onMobChanged: (mob: Targetable) => void;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    options: MobSpawnerManagerOptions = {},
  ) {
    this.onMobClicked = options.onMobClicked ?? (() => {});
    this.onMobChanged = options.onMobChanged ?? (() => {});
    this.createMobs(options.initialStates ?? []);
    this.bindServerEvents();
  }

  private createMobs(states: MobSpawnState[]) {
    for (const state of states) {
      this.createMob(state);
    }
  }

  isBlockingTile(tileX: number, tileY: number) {
    for (const mob of this.mobs.values()) {
      const definition = getMobDefinition(mob.mobId);
      if (
        mob.alive &&
        !definition?.playersCanRunThrough &&
        mob.tileX === tileX &&
        mob.tileY === tileY
      ) {
        return true;
      }
    }

    return false;
  }

  getMobWorldPosition(mobId: string) {
    const mob = this.mobs.get(mobId);
    return mob ? { x: mob.container.x, y: mob.container.y } : null;
  }

  private createMob(state: MobSpawnState) {
    const definition = getMobDefinition(state.mobId);
    if (!definition || this.mobs.has(state.id)) return null;

    const sprite = this.scene.add.image(0, 0, definition.spriteKey);
    const hpBackground = this.scene.add
      .rectangle(-HP_BAR_WIDTH / 2, -TILE_SIZE / 2 - 5, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x391616)
      .setOrigin(0, 0.5);
    const hpFill = this.scene.add
      .rectangle(-HP_BAR_WIDTH / 2, -TILE_SIZE / 2 - 5, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0xc94f4f)
      .setOrigin(0, 0.5);
    const hpContainer = this.scene.add
      .container(
        state.tileX * TILE_SIZE + TILE_SIZE / 2,
        state.tileY * TILE_SIZE + TILE_SIZE / 2,
        [hpBackground, hpFill],
      )
      .setDepth(MOB_STATUS_DEPTH)
      .setVisible(state.alive);

    const container = this.scene.add
      .container(
        state.tileX * TILE_SIZE + TILE_SIZE / 2,
        state.tileY * TILE_SIZE + TILE_SIZE / 2,
        [sprite],
      )
      .setDepth(MOB_DEPTH)
      .setVisible(state.alive);

    const mob: RenderedMob = {
      ...state,
      targetType: "mob",
      name: definition.name,
      container,
      sprite,
      hpContainer,
      hpFill,
    };

    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => this.onMobClicked(mob));

    this.mobs.set(state.id, mob);
    this.updateMobVisuals(mob);
    return mob;
  }

  private bindServerEvents() {
    this.socket.on("mob:state", this.handleMobState);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  private handleMobState = (state: MobStatePayload) => {
    const mob = this.mobs.get(state.id) ?? this.createMob(state);
    if (!mob) return;

    const wasAlive = mob.alive;
    const previousTileX = mob.tileX;
    const previousTileY = mob.tileY;
    Object.assign(mob, state);
    this.moveMobToState(mob, previousTileX, previousTileY, wasAlive);
    this.updateMobVisuals(mob);
    this.onMobChanged(mob);

    if (wasAlive && !state.alive) {
      this.scene.tweens.add({
        targets: [mob.container, mob.hpContainer],
        alpha: 0,
        duration: 200,
        ease: "Sine.easeOut",
        onComplete: () => {
          mob.container.setVisible(false);
          mob.hpContainer.setVisible(false);
        },
      });
      return;
    }

    if (!wasAlive && state.alive) {
      this.syncMobPosition(mob);
      mob.container.setAlpha(0).setVisible(true);
      mob.hpContainer.setAlpha(0).setVisible(true);
      this.scene.tweens.add({
        targets: [mob.container, mob.hpContainer],
        alpha: 1,
        duration: 250,
        ease: "Sine.easeOut",
      });
    }
  };

  private updateMobVisuals(mob: RenderedMob) {
    const hpRatio = mob.maxHp > 0 ? Phaser.Math.Clamp(mob.hp / mob.maxHp, 0, 1) : 0;
    mob.hpFill.setDisplaySize(Math.max(0.1, HP_BAR_WIDTH * hpRatio), HP_BAR_HEIGHT);
    mob.hpContainer.setVisible(mob.alive);
  }

  private syncMobPosition(mob: RenderedMob) {
    const x = mob.tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = mob.tileY * TILE_SIZE + TILE_SIZE / 2;
    mob.container.setPosition(x, y);
    mob.hpContainer.setPosition(x, y);
  }

  private moveMobToState(mob: RenderedMob, previousTileX: number, previousTileY: number, wasAlive: boolean) {
    const moved = previousTileX !== mob.tileX || previousTileY !== mob.tileY;
    if (!moved) return;

    const isOneTileStep = Math.abs(mob.tileX - previousTileX) + Math.abs(mob.tileY - previousTileY) === 1;
    if (!wasAlive || !mob.alive || !isOneTileStep) {
      this.scene.tweens.killTweensOf([mob.container, mob.hpContainer]);
      this.syncMobPosition(mob);
      return;
    }

    this.scene.tweens.killTweensOf([mob.container, mob.hpContainer]);
    this.scene.tweens.add({
      targets: [mob.container, mob.hpContainer],
      x: mob.tileX * TILE_SIZE + TILE_SIZE / 2,
      y: mob.tileY * TILE_SIZE + TILE_SIZE / 2,
      duration: MOB_MOVE_DURATION_MS,
      ease: "Linear",
    });
  }

  private destroy = () => {
    this.socket.off("mob:state", this.handleMobState);
    for (const mob of this.mobs.values()) {
      mob.hpContainer.destroy(true);
      mob.container.destroy(true);
    }
    this.mobs.clear();
  };
}
