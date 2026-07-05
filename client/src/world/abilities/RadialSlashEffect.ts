import Phaser from "phaser";
import { TILE_SIZE } from "../../config/map";

const SLASH_DEPTH = 24;
const SLASH_DURATION_MS = 260;
const SLASH_COLOR = 0xffffff;
const SLASH_GLOW_COLOR = 0xe5c36b;

export class RadialSlashEffect {
  constructor(private scene: Phaser.Scene) {}

  play(tileX: number, tileY: number, radiusTiles: number) {
    const radius = Math.max(TILE_SIZE * 0.74, radiusTiles * TILE_SIZE * 1.18);
    const originX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const originY = tileY * TILE_SIZE + TILE_SIZE / 2;
    const spin = { progress: 0 };
    const container = this.scene.add
      .container(originX, originY)
      .setDepth(SLASH_DEPTH)
      .setAlpha(0.96);

    const glow = this.scene.add.graphics();
    const slash = this.scene.add.graphics();
    container.add([glow, slash]);

    const draw = () => {
      glow.clear();
      slash.clear();

      const startAngle = Phaser.Math.DegToRad(-92 + spin.progress * 300);
      const endAngle = Phaser.Math.DegToRad(252 + spin.progress * 300);

      glow.lineStyle(7, SLASH_GLOW_COLOR, 0.26);
      glow.beginPath();
      glow.arc(0, 0, radius + 2, startAngle, endAngle, false);
      glow.strokePath();

      slash.lineStyle(3, SLASH_COLOR, 0.84);
      slash.beginPath();
      slash.arc(0, 0, radius, startAngle, endAngle, false);
      slash.strokePath();

      const leadingEdge = Phaser.Math.Linear(startAngle, endAngle, 0.88);
      slash.lineStyle(2, SLASH_COLOR, 0.62);
      slash.beginPath();
      slash.moveTo(Math.cos(leadingEdge) * (radius - 5), Math.sin(leadingEdge) * (radius - 5));
      slash.lineTo(Math.cos(leadingEdge) * (radius + 5), Math.sin(leadingEdge) * (radius + 5));
      slash.strokePath();
    };

    draw();

    this.scene.tweens.add({
      targets: spin,
      progress: 1,
      duration: SLASH_DURATION_MS,
      ease: "Cubic.easeOut",
      onUpdate: draw,
      onComplete: () => container.destroy(true),
    });
    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: SLASH_DURATION_MS,
      ease: "Cubic.easeOut",
    });
  }
}
