import Phaser from "phaser";

interface WorldLabelOptions {
  target: Phaser.GameObjects.Components.Transform & Partial<Pick<Phaser.GameObjects.Container, "getWorldPoint">>;
  text: string;
  offsetY: number;
  color: string;
  fontSize: number;
  className?: string;
}

interface WorldLabel {
  element: HTMLDivElement;
  target: Phaser.GameObjects.Components.Transform & Partial<Pick<Phaser.GameObjects.Container, "getWorldPoint">>;
  offsetY: number;
}

export interface WorldLabelHandle {
  destroy: () => void;
  setText: (text: string) => void;
}

const LABEL_LAYER_ID = "world-label-layer";

export class WorldLabelOverlay {
  private labels = new Set<WorldLabel>();
  private layer: HTMLDivElement;
  private root: HTMLElement;

  constructor(private scene: Phaser.Scene) {
    const root = document.getElementById("game-root");
    if (!root) throw new Error("Missing #game-root element for world labels");

    this.root = root;
    this.layer = this.ensureLayer(root);

    this.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.update, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  addLabel(options: WorldLabelOptions): WorldLabelHandle {
    const element = document.createElement("div");
    element.className = ["world-label", options.className].filter(Boolean).join(" ");
    element.textContent = options.text;
    element.style.color = options.color;
    element.style.fontSize = `${options.fontSize}px`;

    this.layer.appendChild(element);

    const label: WorldLabel = {
      element,
      target: options.target,
      offsetY: options.offsetY,
    };
    this.labels.add(label);
    this.positionLabel(label);

    return {
      destroy: () => this.removeLabel(label),
      setText: (text: string) => {
        element.textContent = text;
        this.positionLabel(label);
      },
    };
  }

  update() {
    for (const label of this.labels) {
      this.positionLabel(label);
    }
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.update, this);

    for (const label of this.labels) {
      label.element.remove();
    }
    this.labels.clear();

    if (this.layer.childElementCount === 0) {
      this.layer.remove();
    }
  }

  private ensureLayer(root: HTMLElement) {
    const existingLayer = root.querySelector<HTMLDivElement>(`#${LABEL_LAYER_ID}`);
    if (existingLayer) return existingLayer;

    const layer = document.createElement("div");
    layer.id = LABEL_LAYER_ID;
    root.appendChild(layer);
    return layer;
  }

  private removeLabel(label: WorldLabel) {
    label.element.remove();
    this.labels.delete(label);
  }

  private positionLabel(label: WorldLabel) {
    const camera = this.scene.cameras.main;
    const canvas = this.scene.game.canvas;
    const canvasRect = canvas.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();

    const worldPoint = label.target.getWorldPoint?.() ?? label.target;
    const screenX = camera.x + (worldPoint.x - camera.worldView.x) * camera.zoom;
    const screenY = camera.y + (worldPoint.y + label.offsetY - camera.worldView.y) * camera.zoom;
    const scaleX = canvasRect.width / this.scene.scale.width;
    const scaleY = canvasRect.height / this.scene.scale.height;
    const cssX = canvasRect.left - rootRect.left + screenX * scaleX;
    const cssY = canvasRect.top - rootRect.top + screenY * scaleY;
    const offscreen = (
      screenX < -80 ||
      screenY < -40 ||
      screenX > this.scene.scale.width + 80 ||
      screenY > this.scene.scale.height + 40
    );

    label.element.style.opacity = offscreen ? "0" : "1";
    label.element.style.transform = `translate3d(${Math.round(cssX)}px, ${Math.round(cssY)}px, 0) translate(-50%, -100%)`;
  }
}
