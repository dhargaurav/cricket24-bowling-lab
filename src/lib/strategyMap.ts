/**
 * Strategy Weights & Biases
 * ------------------------------------------------------------
 * Provides weighted pools for DeliveryType, Length, and Line
 * based on bowler archetype, phase, and pitch. deliveryLogic.ts
 * consumes these to generate unique, trap-oriented sequences.
 */

import {
  Bowler, BowlerType, DeliveryType, Length, Line, PhaseId, PitchType,
  DELIVERY_TYPES_PACE, DELIVERY_TYPES_SPIN, LENGTHS, LINES
} from "@/types/cricket";

type Weights<T extends string> = Partial<Record<T, number>>;

function baseDeliveryWeights(b: Bowler): Weights<DeliveryType> {
  const w: Weights<DeliveryType> = {};
  const isSpin = b.type.includes("spin");
  if (isSpin) {
    for (const t of DELIVERY_TYPES_SPIN) w[t] = 1;
    // nudge by strengths
    (b.strengths || []).forEach((s) => {
      const k = s.toLowerCase();
      if (k.includes("arm")) w["Arm ball"] = (w["Arm ball"] ?? 1) + 1.5;
      if (k.includes("googly")) w["Googly"] = (w["Googly"] ?? 1) + 1.5;
      if (k.includes("top")) w["Top-spinner"] = (w["Top-spinner"] ?? 1) + 1;
    });
    return w;
  }

  // pace / seam / swing
  for (const t of DELIVERY_TYPES_PACE) w[t] = 1;
  (b.strengths || []).forEach((s) => {
    const k = s.toLowerCase();
    if (k.includes("yorker")) w["Standard"]! += 0.2; // yorker is a Length; keep Standard viable
    if (k.includes("outswing")) w["Outswing"] = (w["Outswing"] ?? 1) + 1.5;
    if (k.includes("inswing")) w["Inswing"] = (w["Inswing"] ?? 1) + 1.5;
    if (k.includes("wobble") || k.includes("seam")) w["Cross seam"] = (w["Cross seam"] ?? 1) + 1.2;
    if (k.includes("cutter")) {
      w["Off cutter"] = (w["Off cutter"] ?? 1) + 1.2;
      w["Leg cutter"] = (w["Leg cutter"] ?? 1) + 1.2;
    }
    if (k.includes("bouncer")) w["Bouncer"] = (w["Bouncer"] ?? 1) + 1.2;
    if (k.includes("slower")) w["Slower"] = (w["Slower"] ?? 1) + 1.2;
  });
  return w;
}

function baseLengthWeights(b: Bowler, phase: PhaseId): Weights<Length> {
  const w: Weights<Length> = {};
  for (const L of LENGTHS) w[L] = 1;

  if (phase === "powerplay") {
    w["Good"]! += 0.6; w["Back-of-length"]! += 0.3; w["Full"]! += 0.3;
  } else if (phase === "middle") {
    w["Good"]! += 0.4; w["Back-of-length"]! += 0.4;
  } else { // death
    w["Yorker"]! += 1.6; w["Full"]! += 0.5; w["Short"]! += 0.3;
  }

  // spin: little bias to "Good"
  if (b.type.includes("spin")) {
    w["Good"]! += 0.4;
  }

  return w;
}

function baseLineWeights(b: Bowler, phase: PhaseId): Weights<Line> {
  const w: Weights<Line> = {};
  for (const L of LINES) w[L] = 0.5; // default low

  // common attacking lines
  w["Off stump"]! += 0.8;
  w["Middle stump"]! += 0.6;
  w["4th stump"]! += 0.8;
  w["5th stump"]! += 0.5;

  if (phase === "powerplay") {
    w["4th stump"]! += 0.4;
    w["Off stump"]! += 0.3;
  } else if (phase === "death") {
    w["Wide outside off"]! += 1.0;
    w["Outside off"]! += 0.6;
    w["At body"]! += 0.4;
  }
  if (b.type.includes("spin")) {
    w["Outside off"]! += 0.4;
    w["Leg stump"]! += 0.3;
  }

  return w;
}

function applyPitchModifiers(w: { del: Weights<DeliveryType>; len: Weights<Length>; lin: Weights<Line> }, pitch: PitchType) {
  // green: seam & back-of-length more effective
  if (pitch === "Green") {
    w.del["Cross seam"] = (w.del["Cross seam"] ?? 1) + 0.6;
    w.len["Back-of-length"] = (w.len["Back-of-length"] ?? 1) + 0.5;
  }
  // dusty: cutters/spin, good/full
  if (pitch === "Dusty") {
    w.del["Off cutter"] = (w.del["Off cutter"] ?? 1) + 0.7;
    w.del["Leg cutter"] = (w.del["Leg cutter"] ?? 1) + 0.7;
    w.len["Good"] = (w.len["Good"] ?? 1) + 0.4;
    w.len["Full"] = (w.len["Full"] ?? 1) + 0.2;
  }
  // dry: wide yorkers & cutters hold, misc variations
  if (pitch === "Dry") {
    w.len["Yorker"] = (w.len["Yorker"] ?? 1) + 0.5;
    w.lin["Wide outside off"] = (w.lin["Wide outside off"] ?? 1) + 0.6;
    w.del["Slower"] = (w.del["Slower"] ?? 1) + 0.4;
  }
}

export function buildWeightedPools(b: Bowler, phase: PhaseId, pitch: PitchType) {
  const del = baseDeliveryWeights(b);
  const len = baseLengthWeights(b, phase);
  const lin = baseLineWeights(b, phase);
  applyPitchModifiers({ del, len, lin }, pitch);

  // flatten to tuples for RNG picking
  const delPool = Object.entries(del) as [DeliveryType, number][];
  const lenPool = Object.entries(len) as [Length, number][];
  const linPool = Object.entries(lin) as [Line, number][];

  return { delPool, lenPool, linPool };
}
