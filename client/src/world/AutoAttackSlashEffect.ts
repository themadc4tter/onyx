import Phaser from "phaser";
import { TILE_SIZE } from "../config/map";

const SLASH_DEPTH = 22;
const SLASH_DURATION_MS = 170;
const SLASH_RADIUS = TILE_SIZE * 0.78;
const SLASH_THICKNESS = TILE_SIZE * 0.28;
const SWING_ARC_RADIANS = Phaser.Math.DegToRad(42);

export class AutoAttackSlashEffect {
  constructor(private scene: Phaser.Scene) {}

  play(origin: Phaser.Math.Vector2, target: Phaser.Math.Vector2) {
    const angleToTarget = Phaser.Math.Angle.Between(origin.x, origin.y, target.x, target.y);
    const container = this.scene.add
      .container(origin.x, origin.y)
      .setDepth(SLASH_DEPTH)
      .setRotation(angleToTarget - SWING_ARC_RADIANS / 2)
      .setAlpha(0.95);

    const glow = this.createCrescent(0xffffff, 0.26, SLASH_RADIUS + 2, SLASH_THICKNESS + 3);
    const slash = this.createCrescent(0xffffff, 0.86, SLASH_RADIUS, SLASH_THICKNESS);
    const leadingEdge = this.createCrescent(0xffffff, 0.55, SLASH_RADIUS + 1, 2);

    container.add([glow, slash, leadingEdge]);

    this.scene.tweens.add({
      targets: container,
      rotation: angleToTarget + SWING_ARC_RADIANS / 2,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: SLASH_DURATION_MS,
      ease: "Cubic.easeOut",
      onComplete: () => container.destroy(true),
    });
  }

  private createCrescent(color: number, alpha: number, radius: number, thickness: number) {
    const graphics = this.scene.add.graphics();
    const points = this.buildCrescentPoints(radius, thickness);

    graphics.fillStyle(color, alpha);
    graphics.fillPoints(points, true, true);
    return graphics;
  }

  private buildCrescentPoints(radius: number, thickness: number) {
    const startAngle = Phaser.Math.DegToRad(-58);
    const endAngle = Phaser.Math.DegToRad(58);
    const segments = 14;
    const outerPoints: Phaser.Math.Vector2[] = [];
    const innerPoints: Phaser.Math.Vector2[] = [];

    for (let index = 0; index <= segments; index += 1) {
      const progress = index / segments;
      const angle = Phaser.Math.Linear(startAngle, endAngle, progress);
      outerPoints.push(new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
    }

    for (let index = segments - 1; index >= 1; index -= 1) {
      const progress = index / segments;
      const angle = Phaser.Math.Linear(startAngle, endAngle, progress);
      const taper = Math.sin(progress * Math.PI);
      const innerRadius = radius - thickness * Phaser.Math.Linear(0.2, 1, taper);
      innerPoints.push(new Phaser.Math.Vector2(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius));
    }

    return [...outerPoints, ...innerPoints];
  }
}
