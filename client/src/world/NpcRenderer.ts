import Phaser from "phaser";
import { TILE_SIZE } from "../config/map";
import type { PlacedNpcDefinition } from "./npcs";

const NPC_DEPTH = 18;
const NPC_NAME_LABEL_FONT_SIZE = "7px";
const NPC_TITLE_LABEL_FONT_SIZE = "6px";
const NPC_LABEL_RESOLUTION = 4;

export class NpcRenderer {
  private containers: Phaser.GameObjects.Container[] = [];

  constructor(private scene: Phaser.Scene) {}

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
    this.containers = [];
  }

  private createNpcContainer(npc: PlacedNpcDefinition) {
    const sprite = this.scene.add.image(0, 0, npc.spriteKey);
    const nameLabel = this.createLabel(npc.name, -TILE_SIZE / 2 - 10, NPC_NAME_LABEL_FONT_SIZE, "#ffffff");
    const titleLabel = this.createLabel(`<${npc.title}>`, -TILE_SIZE / 2 - 2, NPC_TITLE_LABEL_FONT_SIZE, "#ffd98a");

    return this.scene.add
      .container(
        npc.tileX * TILE_SIZE + TILE_SIZE / 2,
        npc.tileY * TILE_SIZE + TILE_SIZE / 2,
        [sprite, nameLabel, titleLabel],
      )
      .setDepth(NPC_DEPTH);
  }

  private createLabel(text: string, y: number, fontSize: string, color: string) {
    const label = this.scene.add
      .text(0, y, text, {
        fontFamily: "Arial, sans-serif",
        fontSize,
        color,
        stroke: "#000000",
        strokeThickness: 1,
        resolution: NPC_LABEL_RESOLUTION,
      })
      .setOrigin(0.5, 1);

    label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return label;
  }
}
