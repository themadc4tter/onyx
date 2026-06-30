import Phaser from "phaser";
import { TILE_SIZE } from "../config/map";
import { WorldLabelOverlay, type WorldLabelHandle } from "../ui/WorldLabelOverlay";
import type { PlacedNpcDefinition } from "./npcs";

const NPC_DEPTH = 18;
const NPC_NAME_LABEL_FONT_SIZE = 13;
const NPC_TITLE_LABEL_FONT_SIZE = 11;

export class NpcRenderer {
  private containers: Phaser.GameObjects.Container[] = [];
  private labels: WorldLabelHandle[] = [];

  constructor(private scene: Phaser.Scene, private labelOverlay: WorldLabelOverlay) {}

  render(npcs: PlacedNpcDefinition[]) {
    this.clear();

    for (const npc of npcs) {
      this.containers.push(this.createNpcContainer(npc));
    }
  }

  clear() {
    for (const container of this.containers) {
      container.destroy(true);
    }
    for (const label of this.labels) {
      label.destroy();
    }
    this.containers = [];
    this.labels = [];
  }

  private createNpcContainer(npc: PlacedNpcDefinition) {
    const sprite = this.scene.add.image(0, 0, npc.spriteKey);
    const container = this.scene.add
      .container(
        npc.tileX * TILE_SIZE + TILE_SIZE / 2,
        npc.tileY * TILE_SIZE + TILE_SIZE / 2,
        [sprite],
      )
      .setDepth(NPC_DEPTH);

    this.labels.push(this.labelOverlay.addLabel({
      target: container,
      text: npc.name,
      offsetY: -TILE_SIZE / 2 - 8,
      color: "#ffffff",
      fontSize: NPC_NAME_LABEL_FONT_SIZE,
      className: "world-label-name",
    }));
    this.labels.push(this.labelOverlay.addLabel({
      target: container,
      text: `<${npc.title}>`,
      offsetY: -TILE_SIZE / 2 - 5,
      color: "#ffd98a",
      fontSize: NPC_TITLE_LABEL_FONT_SIZE,
      className: "world-label-title",
    }));

    return container;
  }
}
