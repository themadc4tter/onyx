import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { getMobDefinition, MOB_DEFINITIONS } from "@onyx/shared/mobs";
import type { MobSpawnState, MobStatePayload } from "@onyx/shared/protocol";
import { TILE_SIZE } from "../config/map";
import { WorldLabelOverlay, type WorldLabelHandle } from "../ui/WorldLabelOverlay";

interface RenderedMob extends MobSpawnState {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  hpFill: Phaser.GameObjects.Rectangle;
  selection: Phaser.GameObjects.Rectangle;
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
}

const MOB_DEPTH = 17;
const HP_BAR_WIDTH = 18;
const HP_BAR_HEIGHT = 3;

export const MOB_SPRITE_ASSETS = Object.values(MOB_DEFINITIONS).map(mob => ({
  key: mob.spriteKey,
  url: mob.spriteUrl,
}));

export class MobSpawnerManager {
  private testDamageKey: Phaser.Input.Keyboard.Key;
  private mobs = new Map<string, RenderedMob>();
  private selectedMobId: string | null = null;
  private onTargetChanged: (target: MobTargetProfile | null) => void;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    private labelOverlay: WorldLabelOverlay,
    options: MobSpawnerManagerOptions = {},
  ) {
    this.onTargetChanged = options.onTargetChanged ?? (() => {});
    this.testDamageKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.createMobs(options.initialStates ?? []);
    this.bindServerEvents();
  }

  update(inputBlocked: boolean) {
    if (inputBlocked || !Phaser.Input.Keyboard.JustDown(this.testDamageKey)) return;

    const target = this.getSelectedAliveMob();
    if (!target) return;

    this.socket.emit("mob:testDamage", { id: target.id });
  }

  clearTarget() {
    if (!this.selectedMobId) return;

    this.selectedMobId = null;
    this.onTargetChanged(null);
    for (const renderedMob of this.mobs.values()) {
      this.updateMobVisuals(renderedMob);
    }
  }

  private createMobs(states: MobSpawnState[]) {
    for (const state of states) {
      this.createMob(state);
    }
  }

  private createMob(state: MobSpawnState) {
    const definition = getMobDefinition(state.mobId);
    if (!definition || this.mobs.has(state.id)) return null;

    const selection = this.scene.add
      .rectangle(0, 0, TILE_SIZE + 4, TILE_SIZE + 4)
      .setStrokeStyle(1, 0xffe07a, 0.9)
      .setVisible(false);
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

  private updateMobVisuals(mob: RenderedMob) {
    const hpRatio = mob.maxHp > 0 ? Phaser.Math.Clamp(mob.hp / mob.maxHp, 0, 1) : 0;
    mob.hpFill.setDisplaySize(Math.max(0.1, HP_BAR_WIDTH * hpRatio), HP_BAR_HEIGHT);
    mob.selection.setVisible(mob.alive && this.selectedMobId === mob.id);
    mob.nameLabel.setVisible(mob.alive);
  }

  private selectMob(mobId: string) {
    const mob = this.mobs.get(mobId);
    if (!mob?.alive) return;

    this.selectedMobId = mobId;
    this.emitSelectedTarget();
    for (const renderedMob of this.mobs.values()) {
      this.updateMobVisuals(renderedMob);
    }
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
