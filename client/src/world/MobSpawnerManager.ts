import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { getMobDefinition, MOB_DEFINITIONS } from "@onyx/shared/mobs";
import type { MobSpawnState, MobStatePayload } from "@onyx/shared/protocol";
import { TILE_SIZE } from "../config/map";
import { WorldLabelOverlay, type WorldLabelHandle } from "../ui/WorldLabelOverlay";
import type { Targetable } from "./TargetingManager";

interface RenderedMob extends MobSpawnState, Targetable {
  targetType: "mob";
  name: string;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  hpFill: Phaser.GameObjects.Rectangle;
  nameLabel: WorldLabelHandle;
}

interface MobSpawnerManagerOptions {
  initialStates?: MobSpawnState[];
  onMobClicked?: (mob: Targetable) => void;
  onMobChanged?: (mob: Targetable) => void;
}

const MOB_DEPTH = 17;
const HP_BAR_WIDTH = 18;
const HP_BAR_HEIGHT = 3;

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
    private labelOverlay: WorldLabelOverlay,
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

    const container = this.scene.add
      .container(
        state.tileX * TILE_SIZE + TILE_SIZE / 2,
        state.tileY * TILE_SIZE + TILE_SIZE / 2,
        [sprite, hpBackground, hpFill],
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

    const mob: RenderedMob = {
      ...state,
      targetType: "mob",
      name: definition.name,
      container,
      sprite,
      hpFill,
      nameLabel,
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
    Object.assign(mob, state);
    this.updateMobVisuals(mob);
    this.onMobChanged(mob);

    if (wasAlive && !state.alive) {
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
  };

  private updateMobVisuals(mob: RenderedMob) {
    const hpRatio = mob.maxHp > 0 ? Phaser.Math.Clamp(mob.hp / mob.maxHp, 0, 1) : 0;
    mob.hpFill.setDisplaySize(Math.max(0.1, HP_BAR_WIDTH * hpRatio), HP_BAR_HEIGHT);
    mob.nameLabel.setVisible(mob.alive);
  }

  private destroy = () => {
    this.socket.off("mob:state", this.handleMobState);
    for (const mob of this.mobs.values()) {
      mob.nameLabel.destroy();
      mob.container.destroy(true);
    }
    this.mobs.clear();
  };
}
