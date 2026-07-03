import Phaser from "phaser";
import { TILE_SIZE } from "../config/map";

const SLASH_DEPTH = 22;
const SLASH_DURATION_MS = 170;
const SLASH_RADIUS = TILE_SIZE * 0.78;
const SLASH_THICKNESS = TILE_SIZE * 0.28;
const SWING_ARC_RADIANS = Phaser.Math.DegToRad(42);

interface AutoAttackSlashOptions {
  color?: number;
}

export class AutoAttackSlashEffect {
  constructor(private scene: Phaser.Scene) {}

  play(origin: Phaser.Math.Vector2, target: Phaser.Math.Vector2, options: AutoAttackSlashOptions = {}) {
    const color = options.color ?? 0xffffff;
    const angleToTarget = Phaser.Math.Angle.Between(origin.x, origin.y, target.x, target.y);
    const swingDirection = Math.random() < 0.5 ? -1 : 1;
    const swing = { progress: 0 };
    const container = this.scene.add
      .container(origin.x, origin.y)
      .setDepth(SLASH_DEPTH)
      .setAlpha(0.95);
    this.setSwingRotation(container, angleToTarget, swingDirection, swing.progress);

    const glow = this.createCrescent(color, 0.26, SLASH_RADIUS + 2, SLASH_THICKNESS + 3);
    const slash = this.createCrescent(color, 0.86, SLASH_RADIUS, SLASH_THICKNESS);
    const leadingEdge = this.createCrescent(color, 0.55, SLASH_RADIUS + 1, 2);

    container.add([glow, slash, leadingEdge]);

    this.scene.tweens.add({
      targets: swing,
      progress: 1,
      duration: SLASH_DURATION_MS,
      ease: "Cubic.easeOut",
      onUpdate: () => this.setSwingRotation(container, angleToTarget, swingDirection, swing.progress),
      onComplete: () => container.destroy(true),
    });
    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: SLASH_DURATION_MS,
      ease: "Cubic.easeOut",
    });
  }

  private setSwingRotation(
    container: Phaser.GameObjects.Container,
    angleToTarget: number,
    swingDirection: number,
    progress: number,
  ) {
    const swingOffset = Phaser.Math.Linear(-SWING_ARC_RADIANS / 2, SWING_ARC_RADIANS / 2, progress);
    container.setRotation(angleToTarget + swingOffset * swingDirection);
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
