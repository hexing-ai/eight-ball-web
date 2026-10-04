export const PHYSICS_VERSION = "planar-spin-1";
export const RULES_VERSION = "casual-eightball-v1";
export type Seat = 0 | 1;
export type Group = "solid" | "stripe";
export type Vec = { x: number; y: number };
export interface Ball extends Vec {
  id: number; vx: number; vy: number; wx: number; wy: number; pocketed: boolean;
}
export interface Shot { angle: number; power: number; spin: number }
export type PhysicsEvent = { speed?: number } & (
  | { type: "collision"; t: number; a: number; b: number }
  | { type: "cushion"; t: number; ball: number }
  | { type: "pocket"; t: number; ball: number; pocket: number });
export interface Frame { t: number; balls: Array<{ id: number; x: number; y: number; pocketed: boolean }> }
export interface Simulation {
  balls: Ball[]; events: PhysicsEvent[]; frames: Frame[]; duration: number;
}
export interface Guide {
  incoming: Vec[]; targetId: number | null; impact: Vec | null;
  target: Vec[]; cue: Vec[]; cueStops: boolean;
}
export function groupOf(id: number): Group | null {
  return id >= 1 && id <= 7 ? "solid" : id >= 9 && id <= 15 ? "stripe" : null;
}
export function other(seat: Seat): Seat { return seat === 0 ? 1 : 0; }
