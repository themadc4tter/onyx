import Phaser from "phaser";
import { TILE_SIZE } from "../config/map";
import type { EquipmentPayload, Facing, Position, RemotePlayerData } from "@onyx/shared/protocol";
import { WorldLabelOverlay, type WorldLabelHandle } from "../ui/WorldLabelOverlay";
import { EquipmentOverlayRenderer } from "../player/EquipmentOverlayRenderer";
import { PLAYER_SPRITE_KEY } from "../player/playerAssets";

interface RemotePlayerState {
  container: Phaser.GameObjects.Container;
  equipmentOverlays: EquipmentOverlayRenderer;
  nameLabel: WorldLabelHandle;
  tileX: number;
  tileY: number;
  moveQueue: Position[];
  moving: boolean;
}

const REMOTE_PLAYER_DEPTH = 19;
const REMOTE_MOVE_DURATION_MS = 120;
const NAME_LABEL_FONT_SIZE = 13;

export class RemotePlayerManager {
  private remotePlayers = new Map<string, RemotePlayerState>();

  constructor(private scene: Phaser.Scene, private labelOverlay: WorldLabelOverlay) {}

  addMany(players: RemotePlayerData[]) {
    for (const player of players) {
      this.add(player);
    }
  }

  add(data: RemotePlayerData) {
    if (this.remotePlayers.has(data.socketId)) return;

    const sprite = this.scene.add.image(0, 0, PLAYER_SPRITE_KEY);
    const container = this.scene.add
      .container(
        data.position.tileX * TILE_SIZE + TILE_SIZE / 2,
        data.position.tileY * TILE_SIZE + TILE_SIZE / 2,
        [sprite],
      )
      .setDepth(REMOTE_PLAYER_DEPTH);
    const equipmentOverlays = new EquipmentOverlayRenderer(this.scene, container);
    if (data.equipment) {
      equipmentOverlays.setEquipment(data.equipment);
    }

    const nameLabel = this.labelOverlay.addLabel({
      target: container,
      text: data.username,
      offsetY: -TILE_SIZE / 2 - 2,
      color: "#ffffff",
      fontSize: NAME_LABEL_FONT_SIZE,
      className: "world-label-name",
    });

    this.remotePlayers.set(data.socketId, {
      container,
      equipmentOverlays,
      nameLabel,
      tileX: data.position.tileX,
      tileY: data.position.tileY,
      moveQueue: [],
      moving: false,
    });
  }

  move(socketId: string, tileX: number, tileY: number, facing: Facing) {
    const remotePlayer = this.remotePlayers.get(socketId);
    if (!remotePlayer) return;

    remotePlayer.moveQueue.push({ tileX, tileY, facing });
    this.playNextMove(remotePlayer);
  }

  updateEquipment(socketId: string, equipment: EquipmentPayload) {
    this.remotePlayers.get(socketId)?.equipmentOverlays.setEquipment(equipment);
  }

  remove(socketId: string) {
    const remotePlayer = this.remotePlayers.get(socketId);
    if (!remotePlayer) return;

    remotePlayer.nameLabel.destroy();
    remotePlayer.equipmentOverlays.destroy();
    remotePlayer.container.destroy(true);
    this.remotePlayers.delete(socketId);
  }

  private playNextMove(remotePlayer: RemotePlayerState) {
    if (remotePlayer.moving) return;

    const next = remotePlayer.moveQueue.shift();
    if (!next) return;

    remotePlayer.moving = true;
    remotePlayer.tileX = next.tileX;
    remotePlayer.tileY = next.tileY;
    this.scene.tweens.add({
      targets: remotePlayer.container,
      x: next.tileX * TILE_SIZE + TILE_SIZE / 2,
      y: next.tileY * TILE_SIZE + TILE_SIZE / 2,
      duration: REMOTE_MOVE_DURATION_MS,
      ease: "Linear",
      onComplete: () => {
        remotePlayer.moving = false;
        this.playNextMove(remotePlayer);
      },
    });
  }
}
