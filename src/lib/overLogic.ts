/**
 * Over Planner
 * ------------------------------------------------------------
 * Assembles a ball-by-ball plan for N overs using deliveryLogic.
 * Guarantees:
 * - Global uniqueness across the whole spell
 * - Trap segments preserved
 * - Over numbers set 1..N
 */

import { Bowler, DeliveryPlanItem, PhaseId, PitchType } from "@/types/cricket";
import { generateDeliveries } from "@/lib/deliveryLogic";

export function buildOverPlan(
  bowler: Bowler,
  overs: number,
  phase: PhaseId,
  pitch: PitchType
): DeliveryPlanItem[] {
  const totalBalls = overs * 6;
  const seq = generateDeliveries(bowler, totalBalls, phase, pitch, `ov:${overs}`);

  // stamp over numbers and ensure each ball has an over index
  return seq.map((d, i) => ({ ...d, over: Math.floor(i / 6) + 1 }));
}
