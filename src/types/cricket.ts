/**
 * Cricket 24 • Shared Types (JSON-only build)
 * ------------------------------------------------------------------
 * Purpose:
 * - Provide strict, centralized type unions for delivery taxonomy,
 *   lengths, lines, phases, and pitch types in Cricket 24 terms.
 * - Keep the Bowler model independent from any CSV/roster shape;
 *   lib/jsonLoader.ts adapts raw JSON -> Bowler.
 * - Used by strategyMap, deliveryLogic, and overLogic to build
 *   strengths-based, trap-oriented, unique wicket plans.
 *
 * Notes:
 * - PitchType uses "Dry" (NOT "Flat"), per requirements.
 * - Downstream logic treats `purpose` as human-readable trap intent.
 */

export type Format = "ODI" | "T20I" | "Test";
export type Arm = "R" | "L";

export type BowlerType =
  | "pace" | "fast" | "fast-medium" | "medium-fast" | "medium"
  | "seam" | "swing"
  | "off-spin" | "leg-spin"
  | "left-arm orthodox" | "left-arm wrist-spin"
  | "mystery" | "pace-spin-hybrid";

/** Cricket 24 pace delivery types (plus a minimal spin set for completeness) */
export type DeliveryType =
  | "Standard"      // seam delivery
  | "Slower"
  | "Outswing"
  | "Inswing"
  | "Cross seam"
  | "Off cutter"
  | "Leg cutter"
  | "Bouncer"
  // spin (safe to retain; used when bowler is spin-type)
  | "Off-break"
  | "Arm ball"
  | "Leg-break"
  | "Googly"
  | "Top-spinner"
  | "Slider";

export type Length = "Full" | "Good" | "Short" | "Yorker" | "Back-of-length";

export type Line =
  | "Off stump"
  | "Middle stump"
  | "Leg stump"
  | "4th stump"
  | "5th stump"
  | "Outside off"
  | "Wide outside off"
  | "At body"
  | "Outside leg";

export type PhaseId = "powerplay" | "middle" | "death";
export type PitchType = "Normal" | "Green" | "Dusty" | "Dry";

export interface Bowler {
  id: string;
  name: string;
  country?: string;
  iplTeam?: string;
  formats?: Format[];
  arm: Arm;
  /** canonicalized archetype (e.g., "seam", "swing", "off-spin", "leg-spin", "fast") */
  type: BowlerType;
  /** text range or number (kept permissive to carry roster info) */
  paceKph?: string | number | null;
  strengths?: string[];
  strategies?: string[];
  isLegend?: boolean;
}

export interface DeliveryPlanItem {
  over: number;           // 1-based
  type: DeliveryType;
  length: Length;
  line: Line;
  /** tactical/field/pattern note; also encodes trap steps */
  purpose: string;
}

export const LENGTHS: Length[] = ["Full", "Good", "Short", "Yorker", "Back-of-length"];
export const LINES: Line[] = [
  "Off stump","Middle stump","Leg stump","4th stump","5th stump",
  "Outside off","Wide outside off","At body","Outside leg",
];
export const PITCH_TYPES: PitchType[] = ["Normal", "Green", "Dusty", "Dry"];
export const PHASES: PhaseId[] = ["powerplay", "middle", "death"];

export const DELIVERY_TYPES_PACE: DeliveryType[] = [
  "Standard","Slower","Outswing","Inswing","Cross seam","Off cutter","Leg cutter","Bouncer",
];
export const DELIVERY_TYPES_SPIN: DeliveryType[] = [
  "Off-break","Arm ball","Leg-break","Googly","Top-spinner","Slider",
];
