/**
 * csvLoader.ts
 * -----------------------------------------------------------------------------
 * What this file does:
 * - Provides a single loader function `parseCSVToBowlers(input: string): Bowler[]`.
 * - Auto-detects input format:
 *    • If the string looks like JSON (`[` or `{`), it parses JSON.
 *    • Otherwise, it parses CSV.
 * - Normalizes each record into your internal `Bowler` shape:
 *    • arm: "Right"/"Left" → "R"/"L"
 *    • formats: only Test/ODI/T20I (map "IPL only" → ["T20I"])
 *    • bowling_type → canonical: Seam | Swing | Off-spin | Leg-spin
 *    • paceKph: keep input string range; undefined if missing
 *    • iplTeam: empty → undefined
 * - Adds derived `strengths` and `strategies` (trap/sequence friendly) based on
 *   `bowling_type` + `pace_spin` (non-destructive: respects any already provided).
 *
 * Why keep JSON + CSV here?
 * - Your UI already imports `parseCSVToBowlers` and fetches text.
 * - With this auto-detection, you can paste a JSON raw URL (like your Git file)
 *   into the same input box and it will “just work” without changing page.tsx.
 *
 * Notes:
 * - Be forgiving: skip only if id/name missing; otherwise coerce safely.
 * - You can move the small heuristics (strengths/strategies) into a config
 *   later if you want purely data-driven behaviour.
 * -----------------------------------------------------------------------------
 */

import type { Bowler } from "@/types/cricket";

// Public API (kept the same import name for page.tsx compatibility)
export function parseCSVToBowlers(input: string): Bowler[] {
  const src = input.trim();

  // Auto-detect JSON vs CSV
  if (src.startsWith("{") || src.startsWith("[")) {
    try {
      const parsed = JSON.parse(src);
      if (Array.isArray(parsed)) {
        return mapJsonArrayToBowlers(parsed);
      }
      // If object with a property containing the array
      const arrLike = Object.values(parsed).find(Array.isArray) as unknown[] | undefined;
      if (arrLike) return mapJsonArrayToBowlers(arrLike);
    } catch {
      // fall through to CSV parsing if JSON parse fails
    }
  }

  return parseCsvToObjects(src).map(normalizeRecord).filter(isValidBowler) as Bowler[];
}

/* ----------------------------------------------------------------------------
 * JSON → Bowler[]
 * Expecting items shaped like your ipl_and_india_bowlers.json:
 * { id, name, country, formats_active, arm, bowling_type, pace_spin, ball_speed_kph, ipl_team }
 * ----------------------------------------------------------------------------
 */
function mapJsonArrayToBowlers(items: any[]): Bowler[] {
  const out: Bowler[] = [];
  for (const raw of items) {
    const rec = normalizeRecord({
      id: raw.id,
      name: raw.name,
      country: raw.country,
      iplTeam: raw.ipl_team,
      formats: raw.formats_active,
      arm: raw.arm,
      type: raw.bowling_type,
      paceKph: raw.ball_speed_kph,
      // optional incoming hints
      strengths: raw.strengths,
      strategies: raw.strategies,
      pace_spin: raw.pace_spin,
    });
    if (isValidBowler(rec)) out.push(rec as Bowler);
  }
  return out;
}

/* ----------------------------------------------------------------------------
 * Normalization pipeline: object → Bowler-ish (may include internal fields)
 * ----------------------------------------------------------------------------
 */
function normalizeRecord(o: any): Partial<InternalBowler> {
  const id = safeStr(o.id);
  const name = titleCase(safeStr(o.name));
  const country = coerceOptStr(o.country);
  const iplTeam = emptyToUndef(o.iplTeam ?? o.ipl_team);
  const arm = normalizeArm(o.arm);
  const type = normalizeType(o.type ?? o.bowling_type);
  const paceKph = coerceOptStr(o.paceKph ?? o.ball_speed_kph);
  const formats = normalizeFormats(o.formats ?? o.formats_active);

  // Respect any provided strengths/strategies; otherwise derive from style hints
  const strengths: string[] | undefined =
    toStringArray(o.strengths) && (o.strengths as string[]).length
      ? dedupeStrings(o.strengths)
      : deriveStrengths(type, coerceOptStr(o.pace_spin));

  const strategies: string[] | undefined =
    toStringArray(o.strategies) && (o.strategies as string[]).length
      ? dedupeStrings(o.strategies)
      : deriveStrategies(type, coerceOptStr(o.pace_spin));

  const isLegend = Boolean(o.isLegend);

  return {
    id,
    name,
    country,
    iplTeam,
    formats,
    arm,
    type,
    paceKph,
    strengths,
    strategies,
    isLegend,
  };
}

function isValidBowler(x: Partial<InternalBowler>): x is Bowler {
  return Boolean(x.id && x.name);
}

/* ----------------------------------------------------------------------------
 * Heuristics for derived strengths & strategies
 * ----------------------------------------------------------------------------
 */
function deriveStrengths(type?: string, style?: string): string[] | undefined {
  if (!type) return undefined;
  const out: string[] = [];
  const t = type.toLowerCase();
  const s = (style ?? "").toLowerCase();

  if (t === "seam") {
    out.push("Hard length into the pitch", "Accurate yorkers");
    if (s.includes("cutter")) out.push("Disguised cutters");
    else out.push("Well‑disguised change of pace");
  } else if (t === "swing") {
    out.push("New‑ball outswing", "Occasional inswing at stumps", "Full lengths to draw drives");
  } else if (t === "off-spin") {
    out.push("Tight stump‑to‑stump lines", "Arm‑ball variation", "Changes of pace/trajectory");
  } else if (t === "leg-spin") {
    out.push("Quick legbreak", "Deceptive googly", "Top‑spinner for bounce");
  }

  return out.length ? out : undefined;
}

function deriveStrategies(type?: string, style?: string): string[] | undefined {
  if (!type) return undefined;
  const t = type.toLowerCase();
  const s = (style ?? "").toLowerCase();

  if (t === "seam") {
    if (s.includes("yorker")) {
      return [
        "Powerplay: hard 4th‑stump; Death: yorker → bouncer → wide yorker trap to jam the batter.",
      ];
    }
    return ["Use hard length to set up, then surprise yorker or back‑of‑length into body to force mistakes."];
  }

  if (t === "swing") {
    return ["Set with 2–3 outswingers, then surprise inswing full at middle/leg for lbw/bowled trap."];
  }

  if (t === "off-spin") {
    return ["Tie down on middle/leg, then sneak the arm‑ball at off/middle after a flighted wide line."];
  }

  if (t === "leg-spin") {
    return ["Two legbreaks 4th‑stump, then fuller googly to attack pads/top of off for bowled/lbw."];
  }

  return undefined;
}

/* ----------------------------------------------------------------------------
 * Normalizers
 * ----------------------------------------------------------------------------
 */
function normalizeArm(v: any): "R" | "L" | undefined {
  const s = safeStr(v).toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("r")) return "R";
  if (s.startsWith("l")) return "L";
  return undefined;
}

function normalizeType(v: any): "Seam" | "Swing" | "Off-spin" | "Leg-spin" | undefined {
  const s = safeStr(v).toLowerCase().replace(/\s+/g, "-");
  if (!s) return undefined;
  if (s.includes("seam") || s.includes("fast")) return "Seam";
  if (s.includes("swing")) return "Swing";
  if (s.includes("off-spin") || s === "off" || s.includes("orthodox")) return "Off-spin";
  if (s.includes("leg-spin") || s.includes("legbreak") || s.includes("wrist")) return "Leg-spin";
  return undefined;
}

function normalizeFormats(v: any): ("Test" | "ODI" | "T20I")[] | undefined {
  const a = toStringArray(v);
  if (!a.length) return undefined;

  const out = new Set<"Test" | "ODI" | "T20I">();
  for (const raw of a) {
    const s = String(raw).trim();
    if (!s) continue;
    if (/^test$/i.test(s)) out.add("Test");
    else if (/^odi$/i.test(s)) out.add("ODI");
    else if (/^t20i?$/i.test(s)) out.add("T20I");
    else if (/^ipl\s*only$/i.test(s)) out.add("T20I");
  }

  // stable display order
  const order = ["T20I", "ODI", "Test"] as const;
  const ordered = order.filter((k) => out.has(k));
  return ordered.length ? (ordered as any) : undefined;
}

/* ----------------------------------------------------------------------------
 * CSV parsing (small, robust enough for common cases)
 * ----------------------------------------------------------------------------
 */
function parseCsvToObjects(csv: string): any[] {
  const rows = splitCsv(csv);
  if (rows.length === 0) return [];
  const headers = rows[0];
  const out: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0].trim() === "") continue;
    const obj: any = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });

    // map common CSV column names into normalized keys
    // (flexible: supports several plausible header spellings)
    const mapped: any = {
      id: obj.id ?? obj.bowler_id ?? obj.slug,
      name: obj.name ?? obj.bowler ?? obj.player,
      country: obj.country,
      iplTeam: obj.iplTeam ?? obj.ipl_team ?? obj.team ?? obj.IPLTeam,
      formats: splitMaybeList(obj.formats ?? obj.formats_active),
      arm: obj.arm ?? obj.handedness,
      type: obj.type ?? obj.bowling_type ?? obj.category,
      paceKph: obj.paceKph ?? obj.ball_speed_kph ?? obj.speed,
      strengths: splitMaybeList(obj.strengths),
      strategies: splitMaybeList(obj.strategies),
      isLegend: parseBoolean(obj.isLegend ?? obj.legend),
    };

    out.push(mapped);
  }
  return out;
}

function splitCsv(csv: string): string[][] {
  const lines = csv.replace(/\r\n/g, "\n").split("\n");
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.length) continue;
    rows.push(parseCsvLine(line));
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/* ----------------------------------------------------------------------------
 * Small utils
 * ----------------------------------------------------------------------------
 */
type InternalBowler = Bowler & {
  // nothing extra for now; reserved if you want to add internal hints later
};

function safeStr(v: any): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function coerceOptStr(v: any): string | undefined {
  const s = safeStr(v);
  return s ? s : undefined;
}

function emptyToUndef(v: any): string | undefined {
  const s = safeStr(v);
  return s.length ? s : undefined;
}

function toStringArray(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = safeStr(v);
  if (!s) return [];
  // split on common list separators
  return s.split(/[|;,]/).map((x) => x.trim()).filter(Boolean);
}

function splitMaybeList(v: any): string[] | undefined {
  const arr = toStringArray(v);
  return arr.length ? arr : undefined;
}

function parseBoolean(v: any): boolean | undefined {
  const s = safeStr(v).toLowerCase();
  if (!s) return undefined;
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return undefined;
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const k = s.trim();
    if (!k) continue;
    if (!seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase());
      out.push(k);
    }
  }
  return out;
}

function titleCase(s: string): string {
  // conservative title-case (preserves internal capitalization if present)
  return s
    .split(" ")
    .map((w) => (/[A-Z]/.test(w.slice(1)) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
