import type { GameCase } from "@/lib/cases";
import type { GameState, Room, RoomEvent } from "@/lib/rooms";

export type { GameCase, GameState, Room, RoomEvent };

export type PlayerClue = {
  id: string;
  text: string;
  number: number;
};
