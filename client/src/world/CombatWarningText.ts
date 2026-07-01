import Phaser from "phaser";

const WARNING_BASE_Y = 82;
const WARNING_PULSE_MS = 1_350;

export class CombatWarningText {
  private element: HTMLDivElement;
  private activeMessage: string | null = null;

  constructor(private scene: Phaser.Scene) {
    this.element = document.createElement("div");
    this.element.style.position = "fixed";
    this.element.style.left = "50%";
    this.element.style.top = `${WARNING_BASE_Y}px`;
    this.element.style.transform = "translateX(-50%)";
    this.element.style.zIndex = "30";
    this.element.style.pointerEvents = "none";
    this.element.style.color = "#ff4040";
    this.element.style.fontFamily = "Georgia, serif";
    this.element.style.fontSize = "17px";
    this.element.style.fontWeight = "700";
    this.element.style.letterSpacing = "0";
    this.element.style.textShadow = "0 1px 0 #260505, 0 0 5px rgba(0, 0, 0, 0.9)";
    this.element.style.opacity = "0";
    this.element.style.display = "none";
    this.element.style.userSelect = "none";
    document.body.appendChild(this.element);

    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
    this.positionElement();
  }

  update() {
    if (!this.activeMessage) return;

    const pulse = (Math.sin((this.scene.time.now / WARNING_PULSE_MS) * Math.PI * 2) + 1) / 2;
    this.element.style.opacity = String(Phaser.Math.Linear(0.58, 0.92, pulse));
    this.positionElement();
  }

  show(message: string) {
    if (this.activeMessage !== message) {
      this.element.textContent = message;
      this.activeMessage = message;
    }

    if (this.element.style.display === "none") {
      this.positionElement();
      this.element.style.display = "block";
      this.element.style.opacity = "0.75";
    }
  }

  hide() {
    if (!this.activeMessage) return;

    this.activeMessage = null;
    this.element.style.display = "none";
    this.element.style.opacity = "0";
  }

  private positionElement() {
    const canvasBounds = this.scene.game.canvas.getBoundingClientRect();
    this.element.style.left = `${canvasBounds.left + canvasBounds.width / 2}px`;
    this.element.style.top = `${canvasBounds.top + WARNING_BASE_Y}px`;
  }

  private handleResize = () => {
    this.positionElement();
  };

  private destroy = () => {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize);
    this.element.remove();
  };
}
