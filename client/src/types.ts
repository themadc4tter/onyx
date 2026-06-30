import type { EquipmentState } from "./game/equipment";

export type Facing = "up" | "down" | "left" | "right";

export interface Position {
  tileX: number;
  tileY: number;
  facing: Facing;
}

export interface RemotePlayerData {
  socketId: string;
  username: string;
  position: Position;
  equipment?: EquipmentState;
}
