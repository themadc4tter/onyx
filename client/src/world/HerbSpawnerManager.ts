import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { TILED_OBJECT_LAYER, TILE_SIZE } from "../config/map";
import type { LocalPlayerController } from "../player/LocalPlayerController";

export interface HerbSpawnState {
  id: string;
  tileX: number;
  tileY: number;
  itemId: string;
  available: boolean;
}

interface HerbSpawn {
  id: string;
  tileX: number;
  tileY: number;
  sprite: Phaser.GameObjects.Image;
  available: boolean;
}

const HERB_SPRITE_KEY = "herb-moonleaf";
export const HERB_SPRITE_URL = "assets/objects/herb1.png";
export const HERB_SPRITE_ASSET_KEY = HERB_SPRITE_KEY;

const HERB_ITEM_NAME = "moonleaf";
const HERB_DEPTH = 11;

export class HerbSpawnerManager {
  private interactKey: Phaser.Input.Keyboard.Key;
  private spawns: HerbSpawn[] = [];

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    private map: Phaser.Tilemaps.Tilemap,
    private player: LocalPlayerController,
    private addSystemMessage: (message: string) => void,
    private initialStates: HerbSpawnState[] = [],
  ) {
    this.interactKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.createSpawns();
    this.bindServerEvents();
  }

  update(inputBlocked: boolean) {
    if (inputBlocked || !Phaser.Input.Keyboard.JustDown(this.interactKey)) return;

    const { tileX, tileY } = this.player.getTilePosition();
    const spawn = this.spawns.find(candidate => (
      candidate.available &&
      candidate.tileX === tileX &&
      candidate.tileY === tileY
    ));

    if (!spawn) return;

    this.socket.emit("herb:pick", { id: spawn.id });
  }

  private createSpawns() {
    const objectLayer = this.map.getObjectLayer(TILED_OBJECT_LAYER);
    const markers = objectLayer?.objects.filter(object => object.type === "herb_spawn") ?? [];
    const initialAvailability = new Map(this.initialStates.map(spawn => [spawn.id, spawn.available]));

    this.spawns = markers.map((marker, index) => {
      const tileX = Math.floor((marker.x ?? 0) / TILE_SIZE);
      const tileY = Math.floor((marker.y ?? 0) / TILE_SIZE);
      const id = marker.name || `herb_spawn_${index + 1}`;
      const available = initialAvailability.get(id) ?? true;
      const sprite = this.scene.add
        .image(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2, HERB_SPRITE_KEY)
        .setDepth(HERB_DEPTH)
        .setVisible(available);

      return {
        id,
        tileX,
        tileY,
        sprite,
        available,
      };
    });
  }

  private bindServerEvents() {
    this.socket.on("herb:state", this.handleHerbState);
    this.socket.on("herb:picked", this.handleHerbPicked);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  private handleHerbState = (state: { id: string; available: boolean }) => {
    const spawn = this.spawns.find(candidate => candidate.id === state.id);
    if (!spawn) return;

    spawn.available = state.available;
    if (!state.available) {
      spawn.sprite.setVisible(false);
      return;
    }

    spawn.sprite.setAlpha(0).setVisible(true);
    this.scene.tweens.add({
      targets: spawn.sprite,
      alpha: 1,
      duration: 250,
      ease: "Sine.easeOut",
    });
  };

  private handleHerbPicked = (payload: { itemId?: string; itemName?: string }) => {
    this.addSystemMessage(`You picked 1 ${payload.itemName ?? payload.itemId ?? HERB_ITEM_NAME}.`);
  };

  private destroy = () => {
    this.socket.off("herb:state", this.handleHerbState);
    this.socket.off("herb:picked", this.handleHerbPicked);
  };
}
