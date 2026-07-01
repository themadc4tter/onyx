import Phaser from "phaser";
import type { MobProjectileFiredPayload } from "@onyx/shared/protocol";
import { TILE_SIZE } from "../config/map";

const PROJECTILE_DEPTH = 24;
const PROJECTILE_CORE_COLOR = 0xf6e27f;
const PROJECTILE_GLOW_COLOR = 0xffa84a;

export class AutoAttackProjectileEffect {
  constructor(private scene: Phaser.Scene) {}

  play(
    payload: MobProjectileFiredPayload,
    getTargetWorldPosition: () => { x: number; y: number } | null,
  ) {
    const origin = this.tileCenterToWorld(payload.originTileX, payload.originTileY);
    const fallbackTarget = this.tileCenterToWorld(payload.targetTileX, payload.targetTileY);
    const projectile = this.scene.add.container(origin.x, origin.y).setDepth(PROJECTILE_DEPTH);
    const glow = this.scene.add.circle(0, 0, 5, PROJECTILE_GLOW_COLOR, 0.28);
    const core = this.scene.add.circle(0, 0, 2.2, PROJECTILE_CORE_COLOR, 0.96);
    projectile.add([glow, core]);

    const startedAt = this.scene.time.now;
    const update = () => {
      const progress = Phaser.Math.Clamp((this.scene.time.now - startedAt) / payload.durationMs, 0, 1);
      const target = getTargetWorldPosition() ?? fallbackTarget;
      const x = Phaser.Math.Linear(origin.x, target.x, progress);
      const y = Phaser.Math.Linear(origin.y, target.y, progress);

      projectile.setPosition(x, y);
      projectile.setScale(Phaser.Math.Linear(0.82, 1.12, Math.sin(progress * Math.PI)));

      if (progress < 1) return;

      this.scene.events.off(Phaser.Scenes.Events.UPDATE, update);
      this.scene.tweens.add({
        targets: projectile,
        alpha: 0,
        scaleX: 1.8,
        scaleY: 1.8,
        duration: 90,
        ease: "Sine.easeOut",
        onComplete: () => projectile.destroy(true),
      });
    };

    this.scene.events.on(Phaser.Scenes.Events.UPDATE, update);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, update);
      projectile.destroy(true);
    });
  }

  private tileCenterToWorld(tileX: number, tileY: number) {
    return {
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: tileY * TILE_SIZE + TILE_SIZE / 2,
    };
  }
}
