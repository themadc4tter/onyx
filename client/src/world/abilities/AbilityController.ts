import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { getAbilityDefinition } from "@onyx/shared/abilities";
import type { AbilityUsedPayload } from "@onyx/shared/protocol";
import { RadialSlashEffect } from "./RadialSlashEffect";

export class AbilityController {
  private radialSlashEffect: RadialSlashEffect;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
  ) {
    this.radialSlashEffect = new RadialSlashEffect(scene);
    this.socket.on("ability:used", this.handleAbilityUsed);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  useSlot(slotIndex: number) {
    this.socket.emit("ability:use", { slotIndex });
  }

  private handleAbilityUsed = (payload: AbilityUsedPayload) => {
    const ability = getAbilityDefinition(payload.abilityId);
    if (!ability) return;

    if (ability.animation.kind === "radial_slash") {
      this.radialSlashEffect.play(payload.originTileX, payload.originTileY, ability.animation.radiusTiles);
    }
  };

  private destroy = () => {
    this.socket.off("ability:used", this.handleAbilityUsed);
  };
}
