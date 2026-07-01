import Phaser from "phaser";
import type { MobProjectileFiredPayload } from "@onyx/shared/protocol";
import { TILE_SIZE } from "../config/map";

const PROJECTILE_DEPTH = 24;
const BOLT_DARK_COLOR = 0x16071f;
const BOLT_SHAFT_COLOR = 0xd29a52;
const BOLT_FEATHER_COLOR = 0xd8d5db;
const BOLT_FEATHER_SHADOW_COLOR = 0x3c3244;
const ORB_CORE_COLOR = 0xf6e27f;
const ORB_GLOW_COLOR = 0xffa84a;

export class AutoAttackProjectileEffect {
  constructor(private scene: Phaser.Scene) {}

  play(
    payload: MobProjectileFiredPayload,
    getTargetWorldPosition: () => { x: number; y: number } | null,
  ) {
    const origin = this.tileCenterToWorld(payload.originTileX, payload.originTileY);
    const fallbackTarget = this.tileCenterToWorld(payload.targetTileX, payload.targetTileY);
    const projectile = this.scene.add.container(origin.x, origin.y).setDepth(PROJECTILE_DEPTH);
    projectile.add(payload.projectileClass === "ranged" ? this.createBolt() : this.createOrb());

    const startedAt = this.scene.time.now;
    const update = () => {
      const progress = Phaser.Math.Clamp((this.scene.time.now - startedAt) / payload.durationMs, 0, 1);
      const target = getTargetWorldPosition() ?? fallbackTarget;
      const x = Phaser.Math.Linear(origin.x, target.x, progress);
      const y = Phaser.Math.Linear(origin.y, target.y, progress);
      const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y);

      projectile.setPosition(x, y);
      projectile.setRotation(angle);
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

  private createBolt() {
    const graphics = this.scene.add.graphics();

    this.fillPixel(graphics, -7, -1, BOLT_FEATHER_SHADOW_COLOR, 0.86);
    this.fillPixel(graphics, -7, 1, BOLT_FEATHER_SHADOW_COLOR, 0.86);
    this.fillPixel(graphics, -6, -2, BOLT_FEATHER_COLOR, 0.92);
    this.fillPixel(graphics, -6, 2, BOLT_FEATHER_COLOR, 0.92);
    this.fillPixel(graphics, -6, 0, BOLT_DARK_COLOR, 0.9);

    for (let x = -5; x <= 1; x += 1) {
      this.fillPixel(graphics, x, 0, BOLT_SHAFT_COLOR, 0.96);
      this.fillPixel(graphics, x, 1, BOLT_DARK_COLOR, 0.42);
    }

    this.fillPixel(graphics, 2, -1, BOLT_DARK_COLOR, 0.98);
    this.fillPixel(graphics, 2, 0, BOLT_SHAFT_COLOR, 0.96);
    this.fillPixel(graphics, 2, 1, BOLT_DARK_COLOR, 0.98);
    this.fillPixel(graphics, 3, -1, BOLT_DARK_COLOR, 0.98);
    this.fillPixel(graphics, 3, 0, BOLT_SHAFT_COLOR, 0.96);
    this.fillPixel(graphics, 3, 1, BOLT_DARK_COLOR, 0.98);
    this.fillPixel(graphics, 4, 0, BOLT_DARK_COLOR, 0.98);

    return graphics;
  }

  private fillPixel(graphics: Phaser.GameObjects.Graphics, x: number, y: number, color: number, alpha: number) {
    const pixelSize = 0.28;
    graphics.fillStyle(color, alpha);
    graphics.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
  }

  private createOrb() {
    const container = this.scene.add.container(0, 0);
    const glow = this.scene.add.circle(0, 0, 5, ORB_GLOW_COLOR, 0.28);
    const core = this.scene.add.circle(0, 0, 2.2, ORB_CORE_COLOR, 0.96);
    container.add([glow, core]);
    return container;
  }
}
