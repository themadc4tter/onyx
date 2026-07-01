import Phaser from "phaser";

const WARNING_DEPTH = 50;
const WARNING_BASE_Y = 82;
const WARNING_PULSE_MS = 1_350;

export class CombatWarningText {
  private text: Phaser.GameObjects.Text;
  private activeMessage: string | null = null;

  constructor(private scene: Phaser.Scene) {
    this.text = this.scene.add
      .text(this.scene.scale.width / 2, WARNING_BASE_Y, "", {
        fontFamily: "Georgia, serif",
        fontSize: "17px",
        color: "#ff4040",
        stroke: "#1f0505",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(WARNING_DEPTH)
      .setScrollFactor(0)
      .setAlpha(0)
      .setVisible(false);

    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  update() {
    if (!this.activeMessage) return;

    const pulse = (Math.sin((this.scene.time.now / WARNING_PULSE_MS) * Math.PI * 2) + 1) / 2;
    this.text.setAlpha(Phaser.Math.Linear(0.58, 0.92, pulse));
  }

  show(message: string) {
    if (this.activeMessage !== message) {
      this.text.setText(message);
      this.activeMessage = message;
    }

    if (!this.text.visible) {
      this.text.setVisible(true).setAlpha(0.75);
    }
  }

  hide() {
    if (!this.activeMessage) return;

    this.activeMessage = null;
    this.text.setVisible(false).setAlpha(0);
  }

  private handleResize = (size: Phaser.Structs.Size) => {
    this.text.setX(size.width / 2);
  };

  private destroy = () => {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.text.destroy();
  };
}
