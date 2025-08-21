/**
 * Delivery Generation & Trap Logic
 * ------------------------------------------------------------
 * Generates unique (type, length, line) triples guided by weights
 * and injects guaranteed wicket-taking traps that vary by phase
 * and bowler archetype. Deterministic via seeded RNG.
 */

/**
 * Delivery Generation & Trap Logic (with purpose text)
 * ------------------------------------------------------------
 * Every ball now has a non-empty `purpose`.
 */

import {
  Bowler, DeliveryPlanItem, DeliveryType, Length, Line, PhaseId, PitchType,
} from "@/types/cricket";
import { buildWeightedPools } from "@/lib/strategyMap";
import { mulberry32, pickWeighted, seedFromString } from "@/lib/random";

type Triple = `${DeliveryType}::${Length}::${Line}`;
const key = (t: DeliveryType, l: Length, n: Line): Triple => `${t}::${l}::${n}`;

/** Human-readable intent for any (type,length,line,phase). */
function describePurpose(type: DeliveryType, length: Length, line: Line, phase: PhaseId): string {
  // Special cases first
  if (length === "Yorker" && (line === "Outside off" || line === "Wide outside off"))
    return "Wide yorker: deny leverage and force toe-end";
  if (length === "Yorker" && (line === "Middle stump" || line === "Off stump" || line === "Leg stump"))
    return "At- stumps yorker: crush base of off/leg";
  if (type === "Bouncer" || length === "Short") {
    if (line === "At body") return "Body bouncer: rush the hook/pull for top edge";
    if (line === "Off stump") return "Shoulder-high: glove/edge to ring";
    return "Change-up bouncer: upset length expectation";
  }
  if (type === "Outswing" && (line === "4th stump" || line === "Off stump"))
    return "Shape away at 4th/off stump: draw drive and outside edge";
  if (type === "Inswing" && (line === "Middle stump" || line === "Leg stump"))
    return "Bring it in at the stumps: play across, LBW/bowled";
  if (type === "Cross seam" && (length === "Back-of-length" || length === "Good"))
    return "Cross seam into deck: variable bounce for miscues";
  if (type === "Off cutter" || type === "Leg cutter")
    return "Cutter into surface: grip/hold to beat timing";
  if (type === "Slower")
    return "Deceive pace: hit toe/end or sky to deep";

  // Spin heuristics
  if (type === "Off-break" && line === "Outside off") return "Tease drive with turn to slip/ring";
  if (type === "Arm ball" && (line === "Middle stump" || line === "Leg stump")) return "Skid on from arm ball: pad/wood threat";
  if (type === "Googly" && (line === "4th stump" || line === "Off stump")) return "Wrong’un across bat face: inside edge/lbw";
  if (type === "Top-spinner") return "Dip & extra bounce: bat-pad/close-in catch";

  // Phase framing
  if (phase === "death" && (line === "Outside off" || line === "Wide outside off"))
    return "Death plan: outside-off channel to protect legside power";
  if (phase === "powerplay" && (line === "4th stump" || line === "Off stump"))
    return "New ball channel: challenge outside edge";

  // Generic
  return `${type} • ${length} at ${line}`;
}

function trapForPace(phase: PhaseId): { setup: Partial<DeliveryPlanItem>[], payoff: Partial<DeliveryPlanItem> } {
  if (phase === "powerplay") {
    return {
      setup: [
        { type: "Outswing", length: "Good", line: "4th stump", purpose: "Set-up: away shape to draw the drive" },
        { type: "Outswing", length: "Good", line: "Off stump", purpose: "Reinforce away channel" },
      ],
      payoff: { type: "Inswing", length: "Full", line: "Middle stump", purpose: "Payoff: in-ducker at pads/wood" },
    };
  }
  if (phase === "death") {
    return {
      setup: [
        { type: "Standard", length: "Yorker", line: "Wide outside off", purpose: "Set-up: wide yorker" },
        { type: "Standard", length: "Yorker", line: "Outside off", purpose: "Repeat wide yorker variant" },
      ],
      payoff: { type: "Bouncer", length: "Short", line: "At body", purpose: "Payoff: surprise bumper for top edge" },
    };
  }
  return {
    setup: [
      { type: "Cross seam", length: "Back-of-length", line: "Off stump", purpose: "Set-up: deck variation" },
      { type: "Slower", length: "Good", line: "Outside off", purpose: "Change pace and width" },
    ],
    payoff: { type: "Inswing", length: "Full", line: "Middle stump", purpose: "Payoff: in-line at stumps" },
  };
}

function trapForSpin(phase: PhaseId): { setup: Partial<DeliveryPlanItem>[], payoff: Partial<DeliveryPlanItem> } {
  if (phase === "powerplay") {
    return {
      setup: [
        { type: "Off-break", length: "Good", line: "Outside off", purpose: "Set-up: tease drive vs ring" },
        { type: "Top-spinner", length: "Good", line: "Off stump", purpose: "Dip & bounce to draw forward" },
      ],
      payoff: { type: "Arm ball", length: "Full", line: "Middle stump", purpose: "Payoff: skid on to pad/wood" },
    };
  }
  if (phase === "death") {
    return {
      setup: [
        { type: "Slider", length: "Good", line: "Outside off", purpose: "Flat & quick wide line" },
        { type: "Off-break", length: "Good", line: "4th stump", purpose: "Turn away to keep reaching" },
      ],
      payoff: { type: "Arm ball", length: "Full", line: "Leg stump", purpose: "Payoff: beat across the line" },
    };
  }
  return {
    setup: [
      { type: "Off-break", length: "Good", line: "Outside off", purpose: "Drive temptation with turn risk" },
      { type: "Googly", length: "Good", line: "4th stump", purpose: "Opposite turn threat" },
    ],
    payoff: { type: "Arm ball", length: "Full", line: "Middle stump", purpose: "Skid on for lbw/bowled" },
  };
}

export function generateDeliveries(
  bowler: Bowler,
  balls: number,
  phase: PhaseId,
  pitch: PitchType,
  seedHint: string
): DeliveryPlanItem[] {
  const seed = seedFromString(`${bowler.id}|${phase}|${pitch}|${seedHint}`);
  const rng = mulberry32(seed);
  const { delPool, lenPool, linPool } = buildWeightedPools(bowler, phase, pitch);

  const isSpin = bowler.type.includes("spin");
  const trap = isSpin ? trapForSpin(phase) : trapForPace(phase);

  const used = new Set<Triple>();
  const out: DeliveryPlanItem[] = [];

  const drawUnique = (force?: Partial<DeliveryPlanItem>): DeliveryPlanItem => {
    let attempts = 0;
    while (attempts++ < 200) {
      const t = (force?.type as DeliveryType) ?? pickWeighted(rng, delPool);
      const L = (force?.length as Length) ?? pickWeighted(rng, lenPool);
      const n = (force?.line as Line) ?? pickWeighted(rng, linPool);
      const k = key(t, L, n);
      if (!used.has(k)) {
        used.add(k);
        const p = force?.purpose ?? describePurpose(t, L, n, phase);
        return { over: 1, type: t, length: L, line: n, purpose: p };
      }
    }
    // extremely rare fallback
    const t = delPool[0][0], L = lenPool[0][0], n = linPool[0][0];
    return { over: 1, type: t, length: L, line: n, purpose: describePurpose(t, L, n, phase) };
  };

  // Fill sequence
  for (let i = 0; i < balls; i++) out.push(drawUnique());

  // Insert trap in middle (setup, setup, payoff)
  if (balls >= 6) {
    const s = Math.max(0, Math.floor(balls / 2) - 2);
    out[s]     = drawUnique(trap.setup[0]);
    out[s + 1] = drawUnique(trap.setup[1]);
    out[s + 2] = drawUnique(trap.payoff);
  }

  return out;
}
