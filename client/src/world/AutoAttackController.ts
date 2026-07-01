import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { getItemDefinition } from "@onyx/shared/items";
import type { MobMeleeImpactPayload, MobProjectileFiredPayload } from "@onyx/shared/protocol";
import type { EquipmentState } from "../game/equipment";
import { TILE_SIZE } from "../config/map";
import { AutoAttackProjectileEffect } from "./AutoAttackProjectileEffect";
import { AutoAttackSlashEffect } from "./AutoAttackSlashEffect";
import type { Targetable } from "./TargetingManager";

interface AutoAttackControllerOptions {
  getTarget: () => Targetable | null;
  getEquipment: () => EquipmentState | null;
  getLocalTilePosition: () => { tileX: number; tileY: number } | null;
  getMobWorldPosition: (mobId: string) => { x: number; y: number } | null;
  isLocalPlayerMoving: () => boolean;
  onActiveChanged?: (active: boolean) => void;
}

type AutoAttackMode =
  | {
      weaponClass: "melee";
      windupMs: number;
      range: 1;
    }
  | {
      weaponClass: "ranged";
      windupMs: number;
      attackRange: number;
    }
  | {
      weaponClass: "magic";
      windupMs: number;
      attackRange: number;
    };

const UNARMED_WINDUP_MS = 1_000;
const MELEE_RANGE_TILES = 1;

export class AutoAttackController {
  private autoAttackKey: Phaser.Input.Keyboard.Key;
  private slashEffect: AutoAttackSlashEffect;
  private projectileEffect: AutoAttackProjectileEffect;
  private active = false;
  private windupStartedAt: number | null = null;
  private onActiveChanged: (active: boolean) => void;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    private options: AutoAttackControllerOptions,
  ) {
    this.autoAttackKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.slashEffect = new AutoAttackSlashEffect(this.scene);
    this.projectileEffect = new AutoAttackProjectileEffect(this.scene);
    this.onActiveChanged = options.onActiveChanged ?? (() => {});
    this.socket.on("mob:meleeImpact", this.handleMeleeImpact);
    this.socket.on("mob:projectileFired", this.handleProjectileFired);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  update(inputBlocked: boolean) {
    if (!inputBlocked && Phaser.Input.Keyboard.JustDown(this.autoAttackKey)) {
      this.toggle();
    }

    this.updateAutoAttack();
  }

  private toggle() {
    if (this.active) {
      this.disable();
      return;
    }

    if (!this.options.getTarget()) return;
    this.active = true;
    this.onActiveChanged(true);
  }

  private disable() {
    if (!this.active && this.windupStartedAt === null) return;

    this.active = false;
    this.windupStartedAt = null;
    this.onActiveChanged(false);
  }

  private updateAutoAttack() {
    if (!this.active) return;

    const target = this.options.getTarget();
    if (!target) {
      this.disable();
      return;
    }

    const mode = this.getAutoAttackMode();
    if (this.options.isLocalPlayerMoving()) {
      this.windupStartedAt = null;
      return;
    }

    if (this.windupStartedAt !== null) {
      if (this.scene.time.now - this.windupStartedAt < mode.windupMs) return;

      this.performAutoAttack(target, mode);
      this.windupStartedAt = null;
      return;
    }

    if (!this.isTargetInRange(target, mode)) return;

    this.windupStartedAt = this.scene.time.now;
  }

  private performAutoAttack(target: Targetable, mode: AutoAttackMode) {
    if (!target.alive || !this.isTargetInRange(target, mode)) return;

    if (target.targetType === "mob") {
      this.socket.emit("mob:autoAttack", { id: target.id });
    }
  }

  private getAutoAttackMode(): AutoAttackMode {
    const mainHand = this.options.getEquipment()?.slots.main_hand;
    if (!mainHand) {
      return {
        weaponClass: "melee",
        windupMs: UNARMED_WINDUP_MS,
        range: MELEE_RANGE_TILES,
      };
    }

    const item = getItemDefinition(mainHand.itemId);
    if (!item?.equipment || item.equipment.slot !== "main_hand") {
      return {
        weaponClass: "melee",
        windupMs: UNARMED_WINDUP_MS,
        range: MELEE_RANGE_TILES,
      };
    }

    if (item.equipment.weaponClass === "magic") {
      return {
        weaponClass: "magic",
        windupMs: item.equipment.attackSpeed * 1_000,
        attackRange: item.equipment.attackRange,
      };
    }

    if (item.equipment.weaponClass === "ranged") {
      return {
        weaponClass: "ranged",
        windupMs: item.equipment.attackSpeed * 1_000,
        attackRange: item.equipment.attackRange,
      };
    }

    return {
      weaponClass: "melee",
      windupMs: item.equipment.attackSpeed * 1_000,
      range: MELEE_RANGE_TILES,
    };
  }

  private isTargetInRange(target: Targetable, mode: AutoAttackMode) {
    const position = this.options.getLocalTilePosition();
    if (!position) return false;

    if (mode.weaponClass === "ranged" || mode.weaponClass === "magic") {
      return Math.hypot(position.tileX - target.tileX, position.tileY - target.tileY) <= mode.attackRange;
    }

    return (
      Math.abs(position.tileX - target.tileX) <= MELEE_RANGE_TILES &&
      Math.abs(position.tileY - target.tileY) <= MELEE_RANGE_TILES
    );
  }

  private handleMeleeImpact = (payload: MobMeleeImpactPayload) => {
    this.slashEffect.play(
      this.tileCenterToVector(payload.originTileX, payload.originTileY),
      this.getMobPositionVector(payload.targetId, payload.targetTileX, payload.targetTileY),
    );
  };

  private handleProjectileFired = (payload: MobProjectileFiredPayload) => {
    this.projectileEffect.play(payload, () => this.options.getMobWorldPosition(payload.targetId));
  };

  private getMobPositionVector(mobId: string, fallbackTileX: number, fallbackTileY: number) {
    const position = this.options.getMobWorldPosition(mobId);
    if (position) return new Phaser.Math.Vector2(position.x, position.y);

    return this.tileCenterToVector(fallbackTileX, fallbackTileY);
  }

  private tileCenterToVector(tileX: number, tileY: number) {
    return new Phaser.Math.Vector2(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2);
  }

  private destroy = () => {
    this.socket.off("mob:meleeImpact", this.handleMeleeImpact);
    this.socket.off("mob:projectileFired", this.handleProjectileFired);
    this.disable();
  };
}
