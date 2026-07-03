import Phaser from "phaser";
import type { EquipmentState, EquipmentSlot } from "../game/equipment";
import { getItemDefinition } from "@onyx/shared/items";

const OVERLAY_DEPTH_ORDER: EquipmentSlot[] = ["head", "chest", "legs", "feet", "off_hand", "main_hand"];

function getEquipmentTextureKey(itemId: string) {
  return `equipment-overlay-${itemId}`;
}

export class EquipmentOverlayRenderer {
  private equipment: EquipmentState | null = null;
  private overlays: Phaser.GameObjects.Image[] = [];
  private pendingTextureKeys = new Set<string>();
  private renderVersion = 0;
  private alpha = 1;

  constructor(
    private scene: Phaser.Scene,
    private container: Phaser.GameObjects.Container,
  ) {}

  setEquipment(equipment: EquipmentState) {
    this.equipment = equipment;
    this.renderVersion += 1;
    this.render(this.renderVersion);
  }

  destroy() {
    this.clearOverlays();
  }

  private render(version: number) {
    if (!this.equipment) return;

    const overlayItems = OVERLAY_DEPTH_ORDER
      .map(slot => this.equipment?.slots[slot] ?? null)
      .map(equippedItem => equippedItem ? getItemDefinition(equippedItem.itemId) : null)
      .filter(item => item?.iconUrl);

    const unloadedItems = overlayItems.filter(item => (
      item && !this.scene.textures.exists(getEquipmentTextureKey(item.id))
    ));
    const missingTextures = unloadedItems.filter(item => (
      item && !this.pendingTextureKeys.has(getEquipmentTextureKey(item.id))
    ));

    if (unloadedItems.length > 0) {
      for (const item of missingTextures) {
        if (!item) continue;
        const textureKey = getEquipmentTextureKey(item.id);
        this.pendingTextureKeys.add(textureKey);
        this.scene.load.image(textureKey, item.iconUrl);
      }

      this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        for (const item of missingTextures) {
          if (item) this.pendingTextureKeys.delete(getEquipmentTextureKey(item.id));
        }
        if (version === this.renderVersion) {
          this.render(version);
        }
      });
      if (missingTextures.length > 0) {
        this.scene.load.start();
      }
      return;
    }

    this.clearOverlays();
    for (const item of overlayItems) {
      if (!item) continue;

      const overlay = this.scene.add.image(0, 0, getEquipmentTextureKey(item.id));
      overlay.setName(`equipment-overlay-${item.id}`);
      overlay.setAlpha(this.alpha);
      this.container.add(overlay);
      this.overlays.push(overlay);
    }
  }

  fadeOut(delayMs: number, durationMs: number) {
    this.alpha = 0;
    this.scene.tweens.killTweensOf(this.overlays);
    if (this.overlays.length === 0) return;

    this.scene.tweens.add({
      targets: this.overlays,
      alpha: 0,
      delay: delayMs,
      duration: durationMs,
      ease: "Sine.easeInOut",
    });
  }

  private clearOverlays() {
    for (const overlay of this.overlays) {
      overlay.destroy();
    }
    this.overlays = [];
  }
}
