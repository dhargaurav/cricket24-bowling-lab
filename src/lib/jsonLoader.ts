/**
 * JSON Roster Loader
 * ------------------------------------------------------------
 * Loads your roster JSON (array of raw objects) and normalizes
 * it into the internal Bowler model. Only JSON is supported.
 *
 * The loader is resilient to your current schema:
 * - formats_active -> formats
 * - arm: "Right"/"Left" -> "R" | "L"
 * - bowling_type/pace_spin hydrated into a canonical `type`
 * - ball_speed_kph -> paceKph
 * - ipl_team -> iplTeam
 */

import { Bowler, Arm, BowlerType, Format } from "@/types/cricket";

type Raw = Record<string, any>;

function asArm(v: string | undefined | null): Arm {
  const s = (v || "").toLowerCase();
  if (s.startsWith("r")) return "R";
  if (s.startsWith("l")) return "L";
  return "R";
}

function deriveType(raw: Raw): BowlerType {
  const bt = String(raw.bowling_type || raw.type || "").toLowerCase();
  const ps = String(raw.pace_spin || "").toLowerCase();

  // primary from bowling_type
  if (bt.includes("off")) return "off-spin";
  if (bt.includes("leg")) return "leg-spin";
  if (bt.includes("wrist")) return "left-arm wrist-spin";
  if (bt.includes("orthodox")) return "left-arm orthodox";
  if (bt.includes("swing")) return "swing";
  if (bt.includes("seam")) return "seam";
  if (bt.includes("spin")) return "off-spin"; // fallback for generic "spin"

  // secondary from pace_spin
  if (ps.includes("mystery")) return "mystery";
  if (ps.includes("wrist")) return "left-arm wrist-spin";
  if (ps.includes("orthodox")) return "left-arm orthodox";
  if (ps.includes("fast")) return "fast";
  if (ps.includes("medium-fast") || ps.includes("fast-medium")) return "fast-medium";

  return "pace";
}

function mapFormats(raw: Raw): Format[] | undefined {
  const fx = raw.formats || raw.formats_active;
  if (!Array.isArray(fx)) return undefined;
  const out: Format[] = [];
  for (const f of fx) {
    const s = String(f).toUpperCase();
    if (s === "ODI" || s === "TEST" || s === "T20I") {
      out.push(s === "TEST" ? "Test" : (s as Format));
    }
  }
  return out.length ? out : undefined;
}

export function parseJSONToBowlers(jsonText: string): Bowler[] {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("Invalid JSON roster");
  }
  const arr: Raw[] = Array.isArray(data) ? data : [data];

  const mapped: Bowler[] = arr.map((r) => ({
    id: String(r.id ?? r.name ?? crypto.randomUUID()).trim().toLowerCase().replace(/\s+/g, "_"),
    name: String(r.name ?? "Unknown").trim(),
    country: r.country ?? undefined,
    iplTeam: r.iplTeam ?? r.ipl_team ?? undefined,
    formats: mapFormats(r),
    arm: asArm(r.arm),
    type: deriveType(r),
    paceKph: r.paceKph ?? r.ball_speed_kph ?? null,
    strengths: Array.isArray(r.strengths) ? r.strengths : undefined,
    strategies: Array.isArray(r.strategies) ? r.strategies : undefined,
    isLegend: Boolean(r.isLegend),
  }));

  // de-dup by id if necessary
  const dedup = new Map<string, Bowler>();
  for (const b of mapped) {
    if (!dedup.has(b.id)) dedup.set(b.id, b);
  }
  return Array.from(dedup.values());
}
