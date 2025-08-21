"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Target,
  ListChecks,
  RefreshCw,
  Download,
  Shield,
  ExternalLink,
} from "lucide-react";

/* ===================== Types ===================== */
type BowlerType =
  | "pace"
  | "swing"
  | "seam"
  | "legspin"
  | "offspin"
  | "leftarm-pace"
  | "leftarm-spin";

interface Bowler {
  id: string;
  name: string;
  country: string;
  iplTeam?: string;
  formats: ("ODI" | "T20I" | "Test")[];
  type: BowlerType;
  arm: "R" | "L";
  paceKph?: string;
  strengths: string[];
  strategies: string;
  isLegend?: boolean;
}

interface DeliveryPlanItem {
  over: number;
  ball: number;
  type: string;   // e.g., seam, outswing, cutter, leg-break, googly...
  length: string; // e.g., yorker, good length, full...
  line: string;   // e.g., 4th stump, outside off, 4th/5th stump (wide yorker line)
  pitchPurpose: string;
}

type PhaseId = "powerplay" | "middle" | "death";
type PitchType = "Normal" | "Green" | "Dusty" | "Flat";

/* ===================== Constants ===================== */
const PHASES: { id: PhaseId; label: string }[] = [
  { id: "powerplay", label: "Initial Overs (Powerplay)" },
  { id: "middle", label: "Middle Overs" },
  { id: "death", label: "Death Overs" },
];
const PITCH_TYPES: PitchType[] = ["Normal", "Green", "Dusty", "Flat"];

const LEGEND_IDS = new Set([
  "javagal_srinath",
  "zaheer_khan",
  "ajit_agarkar",
  "ashish_nehra",
  "anil_kumble",
]);

const DEFAULT_CSV_URL =
  "https://raw.githubusercontent.com/dhargaurav/cricket24-roster/main/cricket24_ipl_roster_updated.csv";

const STORAGE_KEY = "c24_roster_v1";
const CSV_URL_KEY = "c24_roster_csv_url";
const ADMIN_FLAG_KEY = "c24_admin_flag";
const ADMIN_CODE = "c24admin";

/* ===================== Minimal Starter (fallback) ===================== */
const STARTERS: Bowler[] = [
  {
    id: "jasprit_bumrah",
    name: "Jasprit Bumrah",
    country: "India",
    iplTeam: "Mumbai Indians",
    formats: ["ODI", "T20I", "Test"],
    type: "pace",
    arm: "R",
    paceKph: "140–150",
    strengths: ["Yorkers", "Hard 4th stump", "Wobble seam"],
    strategies:
      "New ball: hard length 4th stump. Death: yorker > bouncer > wide yorker. Vary pace with cutters.",
    isLegend: false,
  },
];

/* ===================== CSV Helpers ===================== */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const counts = [
    { d: ",", c: (firstLine.match(/,/g) || []).length },
    { d: ";", c: (firstLine.match(/;/g) || []).length },
    { d: "\t", c: (firstLine.match(/\t/g) || []).length },
  ].sort((a, b) => b.c - a.c);
  return counts[0].c > 0 ? counts[0].d : ",";
}

function parseCSVRobust(csvText: string): Record<string, string>[] {
  let text = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delim = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const clean = (s: string) => s.replace(/[\u00A0\u200B\u200C\u200D]/g, "").trim();
  const header = rows[0].map((h) => clean(h));
  const out = rows
    .slice(1)
    .filter((r) => r.some((c) => String(c || "").trim().length))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => (obj[h] = clean(String(r[idx] ?? ""))));
      return obj;
    });

  return out;
}

function parseCSVToBowlers(csvText: string): Bowler[] {
  const rows = parseCSVRobust(csvText);
  const out: Bowler[] = [];
  rows.forEach((row: any) => {
    const get = (k: string) =>
      row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()] ?? "";
    const formatsRaw = String(get("formats") || "").split("|").filter(Boolean);
    const strengthsRaw = String(get("strengths") || "").split("|").filter(Boolean);
    const legendVal = String(get("isLegend") || get("islegend") || "").toLowerCase();
    const isLegend =
      ["true", "1", "yes", "legend", "y"].includes(legendVal) ||
      LEGEND_IDS.has(String(get("id")));
    const b: Bowler = {
      id: get("id"),
      name: get("name"),
      country: get("country"),
      iplTeam: get("iplTeam") || get("iplteam") || undefined,
      formats: formatsRaw as any,
      arm: (get("arm") as "R" | "L") || "R",
      type: (get("type") as BowlerType) || "seam",
      paceKph: get("paceKph") || get("pacekph") || undefined,
      strengths: strengthsRaw,
      strategies: get("strategies"),
      isLegend,
    };
    if (b.id && b.name) out.push(b);
  });
  return out;
}

function mergeRoster(existing: Bowler[], incoming: Bowler[]): Bowler[] {
  const map = new Map<string, Bowler>();
  existing.forEach((b) => map.set(b.id, b));
  incoming.forEach((b) => map.set(b.id, b));
  return Array.from(map.values());
}

function toCSV(rows: any[], columns: string[]): string {
  const esc = (val: any) => {
    const s = String(val ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return header + "\n" + body;
}

function download(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ===================== RNG + Choice ===================== */
function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function weightedChoice<T extends string>(
  rng: () => number,
  weights: Record<T, number>,
  disallow?: T[],
): T {
  let total = 0;
  for (const [k, v] of Object.entries(weights)) {
    if (!disallow || !disallow.includes(k as T)) total += Math.max(0, v);
  }
  let r = rng() * total;
  for (const [key, val] of Object.entries(weights)) {
    if (disallow && disallow.includes(key as T)) continue;
    const w = Math.max(0, val);
    if (r < w) return key as T;
    r -= w;
  }
  return Object.keys(weights)[0] as T;
}

/* ===================== Delivery Model ===================== */
type PaceBall =
  | "outswing"
  | "inswing"
  | "seam"
  | "cutter"
  | "slower ball"
  | "knuckle"
  | "bouncer";
type SpinBall =
  | "leg-break"
  | "googly"
  | "top-spinner"
  | "off-break"
  | "arm ball"
  | "carrom";

type Length = "short" | "back of length" | "good length" | "full" | "yorker" | "yorker-ish";
type Line =
  | "outside off"
  | "4th stump"
  | "off stump"
  | "middle"
  | "leg stump"
  | "at body"
  | "4th/5th stump";

function hasAny(strengths: string[], needles: string[]) {
  const s = strengths.map((x) => x.toLowerCase());
  return needles.some((n) => s.some((x) => x.includes(n)));
}

type PacePrimary = "seam" | "swing" | "mixed";
function primaryPaceStyle(b: Bowler, strengths: string[]): PacePrimary {
  const s = strengths.map((x) => x.toLowerCase());
  const seam = hasAny(s, ["seam", "wobble"]);
  const swing = hasAny(s, ["swing", "outswing", "inswing"]);
  if (seam && !swing) return "seam";
  if (swing && !seam) return "swing";
  if (seam && swing) return "mixed";
  if (b.type === "seam") return "seam";
  if (b.type === "swing" || b.type === "leftarm-pace") return "swing";
  return "mixed";
}

type SpinPrimary = "leg" | "off" | "mixed";
function primarySpinStyle(b: Bowler, strengths: string[]): SpinPrimary {
  const s = strengths.map((x) => x.toLowerCase());
  const leg = hasAny(s, ["leg-break", "leg break", "googly", "wrong"]);
  const off = hasAny(s, ["off-break", "off break", "arm ball", "carrom"]);
  if (leg && !off) return "leg";
  if (off && !leg) return "off";
  if (leg && off) return "mixed";
  if (b.type === "legspin") return "leg";
  if (b.type === "offspin" || b.type === "leftarm-spin") return "off";
  return "mixed";
}

function derivePaceWeights(
  b: Bowler,
  phase: PhaseId,
  pitch: PitchType,
  strengthsIn: string[],
  strategy: string,
): Record<PaceBall, number> {
  const strengths = strengthsIn.map((x) => x.toLowerCase());
  const primary = primaryPaceStyle(b, strengths);

  const base: Record<PaceBall, number> = {
    outswing: phase === "powerplay" ? 10 : 4,
    inswing: phase === "powerplay" ? 9 : 4,
    seam: phase === "middle" ? 14 : 10,
    cutter: phase === "middle" ? 8 : 6,
    "slower ball": phase === "middle" ? 8 : 9,
    knuckle: phase === "death" ? 5 : 2,
    bouncer: phase === "death" ? 8 : 6,
  };

  if (primary === "seam") {
    base.seam += 12;
    base.outswing += 3;
    base.inswing += 3;
    base.cutter += 2;
  } else if (primary === "swing") {
    base.outswing += 10;
    base.inswing += 10;
    base.seam += 4;
  } else {
    base.seam += 6;
    base.outswing += 6;
    base.inswing += 5;
  }

  if (pitch === "Green") {
    base.seam += 6;
    base.outswing += 3;
    base.inswing += 2;
    base.bouncer += 2;
  } else if (pitch === "Dusty") {
    base.cutter += 5;
    base["slower ball"] += 4;
  } else if (pitch === "Flat") {
    base["slower ball"] += 2;
    base.knuckle += 2;
    base.bouncer += 1;
  }

  if (b.arm === "L") base.inswing += 2;

  const boost = (key: PaceBall, val = 6) => (base[key] += val);
  if (hasAny(strengths, ["wobble", "seam"])) boost("seam", 6);
  if (hasAny(strengths, ["outswing"])) boost("outswing", 6);
  if (hasAny(strengths, ["inswing"])) boost("inswing", 6);
  if (hasAny(strengths, ["swing"])) {
    base.outswing += 4;
    base.inswing += 4;
  }
  if (hasAny(strengths, ["cutter"])) boost("cutter", 6);
  if (hasAny(strengths, ["slower"])) boost("slower ball", 6);
  if (hasAny(strengths, ["knuckle"])) boost("knuckle", 5);
  if (hasAny(strengths, ["bouncer"])) boost("bouncer", 5);

  const s = strategy.toLowerCase();
  if (s.includes("hard length") || s.includes("4th stump")) {
    base.seam += 6;
    base.outswing += 2;
  }
  if (s.includes("swing")) {
    base.outswing += 3;
    base.inswing += 3;
  }
  if (s.includes("bounce") || s.includes("short")) base.bouncer += 4;
  if (s.includes("change") || s.includes("variation") || s.includes("cutter"))
    base.cutter += 4;

  return base;
}

// Allowed delivery families by bowler type
function allowedTypesFor(b: Bowler): Set<string> {
  if (b.type === "offspin" || b.type === "leftarm-spin") {
    // Only off-spin family
    return new Set(["off-break", "arm ball", "carrom", "top-spinner"]);
  }
  if (b.type === "legspin") {
    // Only leg-spin family
    return new Set(["leg-break", "googly", "top-spinner"]);
  }
  // Pace families: seam/swing/pace/leftarm-pace
  return new Set(["outswing", "inswing", "seam", "cutter", "slower ball", "knuckle", "bouncer"]);
}

function deriveSpinWeights(
  b: Bowler,
  phase: PhaseId,
  pitch: PitchType,
  strengthsIn: string[],
  strategy: string,
): Record<SpinBall, number> {
  const strengths = strengthsIn.map((x) => x.toLowerCase());
  const primary = primarySpinStyle(b, strengths);

  const base: Record<SpinBall, number> = {
    "leg-break": 12,
    googly: phase === "middle" ? 8 : 7,
    "top-spinner": phase === "powerplay" ? 8 : 7,
    "wrong’un": phase === "death" ? 7 : 6,
    "off-break": 12,
    "arm ball": phase === "powerplay" ? 9 : 7,
    carrom: phase === "middle" ? 7 : 6,
  };

  if (primary === "leg") {
    base["leg-break"] += 10;
    base.googly += 8;
    base["top-spinner"] += 3;
  } else if (primary === "off") {
    base["off-break"] += 10;
    base["arm ball"] += 8;
    base.carrom += 3;
  } else {
    base["leg-break"] += 6;
    base["off-break"] += 6;
    base.googly += 4;
    base["arm ball"] += 4;
  }

  if (pitch === "Dusty") {
    base["leg-break"] += 6;
    base["off-break"] += 6;
    base["top-spinner"] += 2;
  } else if (pitch === "Green") {
    base["arm ball"] += 3;
    base["off-break"] += 2;
  } else if (pitch === "Flat") {
    base["top-spinner"] += 4;
    base["wrong’un"] += 2;
  }

  const boost = (k: SpinBall, v = 6) => (base[k] += v);
  if (hasAny(strengths, ["leg-break", "leg break"])) boost("leg-break", 8);
  if (hasAny(strengths, ["googly"])) boost("googly", 8);
  if (hasAny(strengths, ["top-spinner", "top spinner"])) boost("top-spinner", 6);
  if (hasAny(strengths, ["wrong", "wrong’un", "wrongun"])) boost("wrong’un", 6);
  if (hasAny(strengths, ["off-break", "off break"])) boost("off-break", 8);
  if (hasAny(strengths, ["arm ball"])) boost("arm ball", 8);
  if (hasAny(strengths, ["carrom"])) boost("carrom", 8);

  const st = strategy.toLowerCase();
  if (st.includes("attack stumps")) {
    base["arm ball"] += 5;
    base["top-spinner"] += 3;
  }
  if (st.includes("slip") || st.includes("short") || st.includes("third")) {
    base["leg-break"] += 3;
    base["off-break"] += 3;
    base["top-spinner"] += 2;
  }

  if (b.type === "leftarm-spin") {
    base["arm ball"] += 3;
    base["off-break"] += 3;
  }

  // Clamp to family
const allowed = allowedTypesFor(b);
(Object.keys(base) as (keyof typeof base)[]).forEach((k) => {
  if (!allowed.has(k as string)) {
    (base as any)[k] = 0;  // disallow cross-family types
  }
});
return base;

}

type LengthT = Record<Length, number>;
type LineT = Record<Line, number>;

function lengthWeightsFor(bowler: Bowler, phase: PhaseId, pitch: PitchType): LengthT {
  const base: LengthT = {
    short: phase === "death" ? 6 : 7,
    "back of length": phase === "powerplay" ? 8 : 9,
    "good length": 11,
    full: phase === "powerplay" ? 9 : 8,
    yorker: phase === "death" ? 14 : 3,
    "yorker-ish": 5,
  };
  if (pitch === "Green") {
    base["back of length"] += 3;
    base["good length"] += 2;
  } else if (pitch === "Dusty") {
    base["back of length"] += 2;
    base.full += 1;
  } else if (pitch === "Flat") {
    base.yorker += 6;
    base["good length"] -= 2;
  }
  if (bowler.type.includes("spin")) {
    base.short -= 4;
    base.yorker -= 6;
    base["yorker-ish"] -= 3;
  }
  return base;
}

function lineWeightsFor(bowler: Bowler, phase: PhaseId, pitch: PitchType): LineT {
  const base: LineT = {
    "outside off": 8,
    "4th stump": 12,
    "off stump": 10,
    middle: 7,
    "leg stump": 6,
    "at body": phase === "death" ? 8 : 6,
    "4th/5th stump": phase === "death" ? 10 : 6,
  };
  if (bowler.type.includes("spin")) {
    base["leg stump"] += 3;
    base["outside off"] += 2;
  } else {
    base["4th stump"] += 2;
  }
  if (pitch === "Flat") {
    base["4th/5th stump"] += 3;
    base.middle += 1;
  }
  return base;
}

function purposeFor(ballType: string, line: Line, length: Length): string {
  if (length === "yorker") {
    return line.includes("4th") || line === "outside off"
      ? "deny arc; toe crusher"
      : "base of stumps / toes";
  }

  if (ballType === "outswing") return "draw drive, find edge";
  if (ballType === "inswing") return "attack pads, bowled/LBW";
  if (ballType === "seam") return "nibble outside edge";
  if (ballType === "cutter") return "hold in the pitch, mistime";
  if (ballType === "slower ball") return "beat swing, hit to field";
  if (ballType === "knuckle") return "deceive pace, miscued loft";
  if (ballType === "bouncer") return "push back, surprise top-edge";

  if (ballType === "leg-break") return "draw drive, slip in play";
  if (ballType === "googly") return "beat inside edge; LBW/bowled";
  if (ballType === "top-spinner") return "extra bounce for splice";
  if (ballType === "wrong’un") return "surprise wicket ball";
  if (ballType === "off-break") return "drag to infield, catch";
  if (ballType === "arm ball") return "skid at stumps/pads";
  if (ballType === "carrom") return "induce outside edge";

  if (length === "good length" && line === "4th stump") return "outside edge chance";
  if (length === "short" && line === "at body") return "cramp for room";
  return "create wicket chance / dot ball";
}

/* buildVariedPlan — type from weights; yorker via length+line */
function buildVariedPlan(
  bowler: Bowler,
  overs: number,
  phase: PhaseId,     // UI-selected phase
  pitch: PitchType,
  salt: string | number = "" // pass `over:${n}` from Spell Planner to make each over unique
): DeliveryPlanItem[] {
  const totalBalls = Math.max(1, overs) * 6;

  // deterministic but unique RNG per (bowler, phase, pitch, overs, salt)
  const seed = hash32(`${bowler.id}|${phase}|${pitch}|${overs}|${salt}`);
  const rng = mulberry(seed);

  const isSpin = bowler.type.includes("spin");
  const bStrengths = (bowler.strengths || []).map((s) => s.toLowerCase());
  const bStrategy = (bowler.strategies || "").toLowerCase();

  const ballWeights = (isSpin
    ? deriveSpinWeights(bowler, phase, pitch, bStrengths, bStrategy)
    : derivePaceWeights(bowler, phase, pitch, bStrengths, bStrategy)) as Record<string, number>;

  const baseLengthWeights = lengthWeightsFor(bowler, phase, pitch);
  const baseLineWeights = lineWeightsFor(bowler, phase, pitch);

  const recentTypes: string[] = [];
  const plan: DeliveryPlanItem[] = [];

  for (let i = 0; i < totalBalls; i++) {
    const over = Math.floor(i / 6) + 1;
    const ball = (i % 6) + 1;

    // clone weights per ball so we can bias safely
    const localType = { ...ballWeights } as Record<string, number>;
    const localLength = { ...(baseLengthWeights as Record<Length, number>) };
    const localLine = { ...(baseLineWeights as Record<Line, number>) };

    // --- (A) Clamp delivery family to bowler type (no cross-family bleed) ---
    {
      const allowed = allowedTypesFor(bowler); // Set<string>
      Object.keys(localType).forEach((k) => {
        if (!allowed.has(k)) delete (localType as any)[k];
      });
      // safety: ensure at least one option remains
      if (Object.keys(localType).length === 0) {
        if (isSpin) localType["off-break"] = 1;
        else localType["seam"] = 1;
      }
    }

    // --- (B) Phase-aware wicket-trap patterns (pace) + spinner pulses ---
    if (!isSpin) {
      const isPP = phase === "powerplay";
      const isMid = phase === "middle";
      const isDeath = phase === "death";

      // pressure balls: end-of-over & death pulses
      if (ball === 6 || (isDeath && (ball === 3 || ball === 6))) {
        localLength["yorker"] = (localLength["yorker"] || 0) + 10;
        localLine["4th/5th stump"] = (localLine["4th/5th stump"] || 0) + 6; // wide-yorker line
        localType["bouncer"] = (localType["bouncer"] || 0) + 2;
      }

      // SEAM bowler: occasional swing pulses (to create edges/LBW even if seam-heavy)
      if (bowler.type === "seam") {
        const swingPulse =
          (isPP && (ball === 1 || ball === 2)) ||
          (isDeath && (ball === 3 || ball === 6)) ||
          ball === 6;
        if (swingPulse) {
          localType["outswing"] = (localType["outswing"] || 0) + 2;
          localType["inswing"] = (localType["inswing"] || 0) + 2;
        }
      }

      // **Wicket-trap sequences**
      if (isPP) {
        // Ball 1–2: full swing around 4th/off stump (edge/LBW)
        if (ball === 1 || ball === 2) {
          localType["outswing"] = (localType["outswing"] || 0) + 5;
          localType["inswing"] = (localType["inswing"] || 0) + 3;
          localLength["full"] = (localLength["full"] || 0) + 5;
          localLine["4th stump"] = (localLine["4th stump"] || 0) + 5;
          localLine["off stump"] = (localLine["off stump"] || 0) + 3;
        }
        // Ball 3–4: hard length / bouncer to push back
        if (ball === 3 || ball === 4) {
          localType["seam"] = (localType["seam"] || 0) + 3;
          localLength["back of length"] = (localLength["back of length"] || 0) + 3;
          if (ball === 4) {
            localType["bouncer"] = (localType["bouncer"] || 0) + 3;
            localLength["short"] = (localLength["short"] || 0) + 3;
            localLine["at body"] = (localLine["at body"] || 0) + 4;
          }
        }
        // Ball 5–6: wicket balls (yorker / hard 4th stump or wide yorker)
        if (ball === 5 || ball === 6) {
          localLength["yorker"] = (localLength["yorker"] || 0) + 6;
          localLine["4th/5th stump"] = (localLine["4th/5th stump"] || 0) + 4;
          localLine["off stump"] = (localLine["off stump"] || 0) + 2;
          localType["cutter"] = (localType["cutter"] || 0) + 2;
          localType["seam"] = (localType["seam"] || 0) + 2;
        }
      } else if (isMid) {
        // Middle: build dots with hard length, then change-ups to find mis-hits; finish strong
        if (ball === 1 || ball === 2) {
          localType["seam"] = (localType["seam"] || 0) + 4;
          localLength["back of length"] = (localLength["back of length"] || 0) + 4;
          localLine["4th stump"] = (localLine["4th stump"] || 0) + 3;
        }
        if (ball === 3 || ball === 4) {
          localType["cutter"] = (localType["cutter"] || 0) + 5;
          localType["slower ball"] = (localType["slower ball"] || 0) + 4;
          localLine["outside off"] = (localLine["outside off"] || 0) + 3;
        }
        if (ball === 5) {
          localType["bouncer"] = (localType["bouncer"] || 0) + 3;
          localLine["at body"] = (localLine["at body"] || 0) + 3;
        }
        if (ball === 6) {
          localLength["yorker"] = (localLength["yorker"] || 0) + 6;
          localLine["off stump"] = (localLine["off stump"] || 0) + 3;
          localLine["4th/5th stump"] = (localLine["4th/5th stump"] || 0) + 3;
        }
      } else if (isDeath) {
        // Death: WL ↔ body bouncer ↔ stump yorker cycle
        if (ball === 1 || ball === 4) {
          localLength["yorker"] = (localLength["yorker"] || 0) + 8;
          localLine["4th/5th stump"] = (localLine["4th/5th stump"] || 0) + 6; // deny arc
        }
        if (ball === 2 || ball === 5) {
          localType["bouncer"] = (localType["bouncer"] || 0) + 6;
          localLength["short"] = (localLength["short"] || 0) + 5;
          localLine["at body"] = (localLine["at body"] || 0) + 5;
        }
        if (ball === 3 || ball === 6) {
          localLength["yorker"] = (localLength["yorker"] || 0) + 8;
          localLine["off stump"] = (localLine["off stump"] || 0) + 6; // toes
        }
      }
    } else {
      // Spin pulses: change deception on balls 3 & 6
      if (ball === 3 || ball === 6) {
        if (localType["googly"] != null) localType["googly"] += 6;
        if (localType["top-spinner"] != null) localType["top-spinner"] += 4;
        if (localType["arm ball"] != null) localType["arm ball"] += 3;
      }
    }

    // --- (C) Prevent 3-in-a-row of the same type ---
    const disallow: string[] = [];
    if (recentTypes.length >= 2) {
      const last = recentTypes[recentTypes.length - 1];
      const prev = recentTypes[recentTypes.length - 2];
      if (last === prev) disallow.push(last);
    }

    // --- (D) Sample type/length/line ---
    const ballType = weightedChoice(rng, localType as any, disallow as any);
    recentTypes.push(ballType);
    if (recentTypes.length > 2) recentTypes.shift();

    let pickedLength = weightedChoice(rng, localLength as any);
    let pickedLine = weightedChoice(rng, localLine as any);

    // coherence rules
    if (ballType === "bouncer") pickedLine = "at body";
    if (isSpin && pickedLength === "short" && rng() < 0.6) {
      pickedLength = "back of length";
    }
    if (pickedLength === "yorker") {
      // wide/stump yorkers determined by line
      if (!["4th/5th stump", "off stump", "outside off"].includes(pickedLine)) {
        pickedLine = "off stump";
      }
    }

    const purpose = purposeFor(ballType, pickedLine as Line, pickedLength as Length);
    plan.push({ over, ball, type: ballType, length: pickedLength, line: pickedLine, pitchPurpose: purpose });
  }

  return plan;
}

/* ===================== Utility: dedupe IDs ===================== */
function dedupeAndFixIds(list: Bowler[]): { list: Bowler[]; collisions: Record<string, number> } {
  const seen = new Map<string, number>();
  const out: Bowler[] = [];
  const collisions: Record<string, number> = {};
  for (const b of list) {
    const base = (b.id && b.id.trim()) || b.name.toLowerCase().replace(/\s+/g, "_");
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    if (n === 1) out.push({ ...b, id: base });
    else {
      const newId = `${base}-${n}`;
      collisions[base] = n;
      out.push({ ...b, id: newId });
    }
  }
  return { list: out, collisions };
}

/* ===================== CSV fetching ===================== */
function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}
async function fetchCsvTextNoCache(url: string): Promise<string> {
  const bust = `__t=${Date.now()}`;
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(url + sep + bust, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV fetch failed (${res.status})`);
  return await res.text();
}

/* ===================== Component ===================== */
export default function Page() {
  const [format, setFormat] = useState<"ODI" | "T20I" | "Test">("T20I");
  const [phase, setPhase] = useState<PhaseId>("powerplay");
  const [pitch, setPitch] = useState<PitchType>("Normal");
  const [query, setQuery] = useState("");
  const [overs, setOvers] = useState(2);

  const [roster, setRoster] = useState<Bowler[]>(STARTERS);
  const [iplFilter, setIplFilter] = useState<string>("All");

  const [admin, setAdmin] = useState<boolean>(false);
  const [csvURL, setCsvURL] = useState<string>(DEFAULT_CSV_URL);
  const [csvHash, setCsvHash] = useState<string>("");
  const [banner, setBanner] = useState<string>("");

  // Spell planner state
  interface SpellItem { bowlerId: string; overs: number; }
  const [spell, setSpell] = useState<SpellItem[]>([]);
  const [autoFollow, setAutoFollow] = useState<boolean>(true);
  const [spellPlan, setSpellPlan] = useState<DeliveryPlanItem[]>([]);
  const [spellBowlerByOver, setSpellBowlerByOver] = useState<Record<number, string>>({});
  const [spellSelectId, setSpellSelectId] = useState<string>("");
  const [spellOversInput, setSpellOversInput] = useState<number>(2);

  // helpers
  function getBowlerById(id: string) {
    return roster.find((b) => b.id === id) || null;
  }

  // interleaved spell builder
  function buildSpellPlan(
    s: SpellItem[],
    ph: PhaseId,
    pt: PitchType
  ): { plan: DeliveryPlanItem[]; overToBowler: Record<number, string> } {
    // build round-robin order by overs remaining
    const q = s.map(x => ({ ...x, remaining: Math.max(0, x.overs || 0) }));
    const order: string[] = [];
    while (q.some(x => x.remaining > 0)) {
      for (let i = 0; i < q.length; i++) {
        if (q[i].remaining > 0) {
          order.push(q[i].bowlerId);
          q[i].remaining -= 1;
        }
      }
    }

    const plan: DeliveryPlanItem[] = [];
    const overToBowler: Record<number, string> = {};

    order.forEach((bowlerId, idx) => {
      const overNum = idx + 1;
      const b = getBowlerById(bowlerId);
      if (!b) return;
      overToBowler[overNum] = bowlerId;
      const oneOver = buildVariedPlan(b, 1, ph, pt, `over:${overNum}`);
      oneOver.forEach(p => plan.push({ ...p, over: overNum }));
    });

    return { plan, overToBowler };
  }

  // spell state helpers
  function totalSpellOvers(s: SpellItem[]) {
    return s.reduce((sum, x) => sum + Math.max(0, x.overs || 0), 0);
  }
  function addToSpell(id: string, o: number) {
    if (!id || o <= 0) return;
    setSpell(prev => [...prev, { bowlerId: id, overs: o }]);
  }
  function removeFromSpell(idx: number) {
    setSpell(prev => prev.filter((_, i) => i !== idx));
  }
  function clearSpell() {
    setSpell([]);
    setSpellPlan([]);
    setSpellBowlerByOver({});
  }
  function generateSpellNow() {
    const t = totalSpellOvers(spell);
    if (t === 0) {
      setBanner("Spell is empty — add bowlers first.");
      setTimeout(() => setBanner(""), 2500);
      return;
    }
    const { plan, overToBowler } = buildSpellPlan(spell, phase, pitch);
    setSpellPlan(plan);
    setSpellBowlerByOver(overToBowler);
    if (autoFollow) {
      const first = overToBowler[1];
      const b = first ? getBowlerById(first) : null;
      if (b) setSelected(b);
    }
    setBanner(`Generated spell: ${t} overs, ${spell.length} spell items`);
    setTimeout(() => setBanner(""), 2500);
  }
// --- Allowed delivery families by bowler type ---
function allowedTypesFor(b: Bowler): Set<string> {
  if (b.type === "offspin" || b.type === "leftarm-spin") {
    return new Set(["off-break", "arm ball", "carrom", "top-spinner"]);
  }
  if (b.type === "legspin") {
    return new Set(["leg-break", "googly", "top-spinner"]); // no "wrong'un" label
  }
  // Pace families (seam/swing/pace/leftarm-pace) can bowl all pace variants:
  return new Set(["outswing","inswing","seam","cutter","slower ball","knuckle","bouncer"]);
}

  // Initial CSV load
  useEffect(() => {
    const flag = localStorage.getItem(ADMIN_FLAG_KEY);
    if (flag === "1") setAdmin(true);
    const savedURL = localStorage.getItem(CSV_URL_KEY) || DEFAULT_CSV_URL;
    setCsvURL(savedURL);
    (async () => {
      try {
        const text = await fetchCsvTextNoCache(savedURL);
        const mapped = parseCSVToBowlers(text);
        if (mapped.length) {
          const { list, collisions } = dedupeAndFixIds(mapped);
          setRoster(list);
          setCsvHash(simpleHash(text));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
          const extra = Object.keys(collisions).length
            ? ` (fixed duplicate ids: ${Object.keys(collisions).join(", ")})`
            : "";
          setBanner(`Loaded ${list.length} players from CSV URL${extra}`);
          setTimeout(() => setBanner(""), 3500);
        }
      } catch {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          setRoster(JSON.parse(cached));
          setBanner("Could not fetch CSV URL. Loaded cached roster.");
          setTimeout(() => setBanner(""), 3500);
        }
      }
    })();
  }, []);

  // Poll CSV for changes
  useEffect(() => {
    if (!csvURL) return;
    const id = setInterval(async () => {
      try {
        const text = await fetchCsvTextNoCache(csvURL);
        const newHash = simpleHash(text);
        if (newHash !== csvHash) {
          const mapped = parseCSVToBowlers(text);
          if (mapped.length) {
            const { list, collisions } = dedupeAndFixIds(mapped);
            setRoster(list);
            setCsvHash(newHash);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            const extra = Object.keys(collisions).length
              ? ` (fixed duplicate ids: ${Object.keys(collisions).join(", ")})`
              : "";
            setBanner(`Updated roster from CSV • ${list.length} players${extra}`);
            setTimeout(() => setBanner(""), 3500);
          }
        }
      } catch {
        /* ignore polling errors */
      }
    }, 90_000);
    return () => clearInterval(id);
  }, [csvURL, csvHash]);

  // Admin
  function unlockAdmin() {
    const code = window.prompt("Enter admin code:");
    if (code && code === ADMIN_CODE) {
      setAdmin(true);
      localStorage.setItem(ADMIN_FLAG_KEY, "1");
      setBanner("Admin unlocked");
      setTimeout(() => setBanner(""), 2000);
    } else if (code !== null) {
      setBanner("Incorrect admin code");
      setTimeout(() => setBanner(""), 2000);
    }
  }

  async function applyCsvURL() {
    if (!csvURL) return;
    try {
      const text = await fetchCsvTextNoCache(csvURL);
      const mapped = parseCSVToBowlers(text);
      if (!mapped.length) {
        setBanner("CSV URL parsed 0 rows — check headers.");
        setTimeout(() => setBanner(""), 3000);
        return;
      }
      const { list, collisions } = dedupeAndFixIds(mapped);
      setRoster(list);
      setCsvHash(simpleHash(text));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      localStorage.setItem(CSV_URL_KEY, csvURL);
      const extra = Object.keys(collisions).length
        ? ` (fixed duplicate ids: ${Object.keys(collisions).join(", ")})`
        : "";
      setBanner(`Loaded ${list.length} players from CSV URL${extra}`);
      setTimeout(() => setBanner(""), 3000);
    } catch (e: any) {
      setBanner("Failed to fetch CSV URL: " + (e?.message || String(e)));
      setTimeout(() => setBanner(""), 4000);
    }
  }

  function onImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        const imported = parseCSVToBowlers(text);
        if (!imported.length) {
          setBanner(
            "Import error: no rows parsed. Check headers like id,name,country,iplTeam,formats,arm,type,strengths,strategies,isLegend.",
          );
          setTimeout(() => setBanner(""), 4000);
          return;
        }
        const merged = mergeRoster(roster, imported);
        const { list, collisions } = dedupeAndFixIds(merged);
        setRoster(list);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        const extra = Object.keys(collisions).length
          ? ` (fixed duplicate ids: ${Object.keys(collisions).join(", ")})`
          : "";
        setBanner(`Imported ${imported.length} players (merged). Total: ${list.length}${extra}`);
        setTimeout(() => setBanner(""), 3500);
      } catch (err: any) {
        setBanner("Import error: " + (err?.message || String(err)));
        setTimeout(() => setBanner(""), 4000);
      }
    };
    reader.readAsText(file);
  }

  // Filtering / selection
  const filtered = useMemo(
    () =>
      roster
        .filter((b) => b.formats.includes(format))
        .filter((b) => (iplFilter === "All" ? true : b.iplTeam === iplFilter))
        .filter((b) =>
          (
            b.name +
            " " +
            b.country +
            " " +
            (b.iplTeam || "") +
            " " +
            b.type +
            (b.isLegend ? " legend" : "")
          )
            .toLowerCase()
            .includes(query.toLowerCase()),
        ),
    [roster, format, iplFilter, query],
  );

  const [selected, setSelected] = useState<Bowler | null>(filtered[0] ?? null);
  useEffect(() => {
    if (!selected && filtered.length > 0) setSelected(filtered[0]);
  }, [filtered, selected]);

  const plan = useMemo(
    () => (selected ? buildVariedPlan(selected, overs, phase, pitch) : []),
    [selected, overs, phase, pitch],
  );

  const iplTeams = useMemo(() => {
    const setTeams = new Set<string>();
    roster.forEach((b) => b.iplTeam && setTeams.add(b.iplTeam));
    return ["All", ...Array.from(setTeams).sort()];
  }, [roster]);

  // Exports
  function exportRoster(full: boolean) {
    const cols = [
      "id",
      "name",
      "country",
      "iplTeam",
      "formats",
      "arm",
      "type",
      "paceKph",
      "strengths",
      "strategies",
      "isLegend",
    ];
    const source = full ? roster : filtered;
    const rows = source.map((b) => ({
      id: b.id,
      name: b.name,
      country: b.country,
      iplTeam: b.iplTeam ?? "",
      formats: (b.formats || []).join("|"),
      arm: b.arm,
      type: b.type,
      paceKph: b.paceKph ?? "",
      strengths: (b.strengths || []).join("|"),
      strategies: b.strategies ?? "",
      isLegend: b.isLegend ? "true" : "",
    }));
    const csv = toCSV(rows, cols);
    download(full ? "roster_full.csv" : "roster_filtered.csv", csv);
  }

  function exportPlanCSV() {
    if (!selected || !plan.length) return;
    const cols = [
      "bowler",
      "country",
      "iplTeam",
      "format",
      "phase",
      "pitch",
      "overs",
      "over",
      "ball",
      "type",
      "length",
      "line",
      "purpose",
    ];
    const rows = plan.map((p) => ({
      bowler: selected.name,
      country: selected.country,
      iplTeam: selected.iplTeam || "",
      format,
      phase,
      pitch,
      overs,
      over: p.over,
      ball: p.ball,
      type: p.type,
      length: p.length,
      line: p.line,
      purpose: p.pitchPurpose,
    }));
    const csv = toCSV(rows, cols);
    const safeName = selected.name.toLowerCase().replace(/\s+/g, "_");
    download(`${safeName}_plan_${format}_${phase}_${pitch}.csv`, csv);
  }

  /* ===================== DEV TESTS (lightweight) ===================== */
  if (process.env.NODE_ENV !== "production") {
    // Test: interleaving when two bowlers have 2 overs each
    const testOrder = (() => {
      const A = "A", B = "B";
      const s = [
        { bowlerId: A, overs: 2 },
        { bowlerId: B, overs: 2 },
      ];
      const tmpRoster: Bowler[] = [
        { id: A, name: "A", country: "X", formats: ["T20I"], type: "seam", arm: "R", strengths: [], strategies: "" },
        { id: B, name: "B", country: "X", formats: ["T20I"], type: "seam", arm: "R", strengths: [], strategies: "" },
      ];
      const getB = (id: string) => tmpRoster.find(b => b.id === id)!;
      const localBuild = (s2: any[]) => {
        const q = s2.map(x => ({ ...x, remaining: x.overs }));
        const order: string[] = [];
        while (q.some(x => x.remaining > 0)) {
          for (let i = 0; i < q.length; i++) {
            if (q[i].remaining > 0) { order.push(q[i].bowlerId); q[i].remaining--; }
          }
        }
        return order;
      };
      return localBuild(s);
    })();
    console.assert(
      JSON.stringify(testOrder) === JSON.stringify(["A", "B", "A", "B"]),
      "Spell interleaving test failed",
    );
  }

  /* ===================== UI ===================== */
  return (
    <div className="min-h-screen w-full bg-[radial-gradient(1200px_600px_at_20%_-10%,#c7d2fe_0%,transparent_60%),radial-gradient(1000px_500px_at_110%_10%,#fbcfe8_0%,transparent_55%)] bg-white">
      <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
        {/* Top bar */}
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600/90 text-white grid place-content-center shadow-sm">
              C24
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
                Bowling Strategy Lab
              </h1>
              <p className="text-xs md:text-sm text-slate-600">
                Shared CSV • strengths-based wicket plans • IPL & legends
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
              <SelectTrigger className="w-32 bg-white/70 backdrop-blur border-slate-200">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="T20I">T20I</SelectItem>
                <SelectItem value="ODI">ODI</SelectItem>
                <SelectItem value="Test">Test</SelectItem>
              </SelectContent>
            </Select>

            <Select value={phase} onValueChange={(v) => setPhase(v as PhaseId)}>
              <SelectTrigger className="w-52 bg-white/70 backdrop-blur border-slate-200">
                <SelectValue placeholder="Phase" />
              </SelectTrigger>
              <SelectContent>
                {PHASES.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={pitch} onValueChange={(v) => setPitch(v as PitchType)}>
              <SelectTrigger className="w-40 bg-white/70 backdrop-blur border-slate-200">
                <SelectValue placeholder="Pitch Type" />
              </SelectTrigger>
              <SelectContent>
                {PITCH_TYPES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={iplFilter} onValueChange={(v) => setIplFilter(v)}>
              <SelectTrigger className="w-48 bg-white/70 backdrop-blur border-slate-200">
                <SelectValue placeholder="IPL Team" />
              </SelectTrigger>
              <SelectContent>
                {["All", ...Array.from(new Set(roster.map((b) => b.iplTeam).filter(Boolean) as string[])).sort()].map(
                  (t) => (
                    <SelectItem key={t} value={t}>
                      {t === "All" ? "All IPL teams" : t}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>

            {/* Admin tools */}
            {!admin ? (
              <button
                onClick={unlockAdmin}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 backdrop-blur border border-slate-200 text-sm hover:bg-white"
                title="Unlock admin"
              >
                <Shield className="h-4 w-4" />
                Admin
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="CSV URL (e.g., GitHub Raw)"
                    value={csvURL}
                    onChange={(e) => setCsvURL(e.target.value)}
                    className="w-72 bg-white/80 backdrop-blur border-slate-200"
                  />
                  <button
                    onClick={applyCsvURL}
                    className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 shadow-sm inline-flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Use CSV URL
                  </button>
                </div>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input type="file" accept=".csv" onChange={onImportCSV} className="hidden" />
                  <span className="px-3 py-2 rounded-lg bg-white/80 backdrop-blur border border-slate-200 hover:bg-white inline-flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Import CSV (merge)
                  </span>
                </label>
              </>
            )}

            <button
              onClick={() =>
                csvURL
                  ? applyCsvURL()
                  : (setBanner("No CSV URL set"), setTimeout(() => setBanner(""), 2500))
              }
              className="px-3 py-2 rounded-lg bg-white/80 backdrop-blur border border-slate-200 text-sm hover:bg-white inline-flex items-center gap-2"
              title="Refresh from CSV"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            <button
              onClick={() => exportRoster(true)}
              className="px-3 py-2 rounded-lg bg-white/80 backdrop-blur border border-slate-200 text-sm hover:bg-white inline-flex items-center gap-2"
              title="Export full roster"
            >
              <Download className="h-4 w-4" />
              Roster (full)
            </button>
            <button
              onClick={() => exportRoster(false)}
              className="px-3 py-2 rounded-lg bg-white/80 backdrop-blur border border-slate-200 text-sm hover:bg-white inline-flex items-center gap-2"
              title="Export filtered roster"
            >
              <Download className="h-4 w-4" />
              Roster (filtered)
            </button>
          </div>
        </div>

        {/* Banner */}
        {!!banner && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 px-3 py-2 text-xs shadow-sm">
            {banner}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Left: Bowlers */}
          <Card className="md:col-span-4 lg:col-span-3 bg-white/80 backdrop-blur border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Search className="h-4 w-4" />
                Bowlers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <Input
                  placeholder="Search name, country, IPL team, type… (try 'legend')"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-white/90"
                />
              </div>
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
                {filtered.map((b, i) => (
                  <button
                    key={`${b.id}-${i}`}
                    onClick={() => setSelected(b)}
                    className={`flex w-full items-start justify-between px-3 py-2 text-left hover:bg-indigo-50/60 transition ${
                      selected?.id === b.id ? "bg-indigo-50" : "bg-white/70"
                    }`}
                  >
                    <div>
                      <div className="font-medium text-slate-900">
                        {b.name}
                        {b.isLegend && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                            Legend
                          </span>
                        )}
                        {b.iplTeam && (
                          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                            {b.iplTeam}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600">
                        {b.country} • {b.type}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">{b.formats.join(" · ")}</div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="p-4 text-sm text-slate-500">No bowlers match your search.</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right: Spell planner + Profile + Over planner */}
          <div className="md:col-span-8 lg:col-span-9 flex flex-col gap-6">

            {/* Spell Planner */}
            <Card className="bg-white/80 backdrop-blur border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Spell Planner (Powerplay / Multi-bowler)</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Add bowler row */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="grow">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Add bowler</label>
                    <Select value={spellSelectId} onValueChange={(v) => setSpellSelectId(v)}>
                      <SelectTrigger className="w-full bg-white/70 border-slate-200">
                        <SelectValue placeholder="Choose bowler" />
                      </SelectTrigger>
                      <SelectContent>
                        {roster.map((b, i) => (
                          <SelectItem key={`${b.id}-${i}`} value={b.id}>
                            {b.name} {b.iplTeam ? `• ${b.iplTeam}` : ""} ({b.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-40">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Overs</label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={spellOversInput}
                      onChange={(e) =>
                        setSpellOversInput(Math.min(10, Math.max(1, Number(e.target.value || 1))))
                      }
                      className="bg-white/90"
                    />
                  </div>

                  <button
                    onClick={() => addToSpell(spellSelectId, spellOversInput)}
                    className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 shadow-sm"
                  >
                    Add to Spell
                  </button>

                  <div className="grow" />

                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoFollow}
                      onChange={(e) => setAutoFollow(e.target.checked)}
                    />
                    <span>Auto-follow selection</span>
                  </label>

                  <button
                    onClick={generateSpellNow}
                    className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 shadow-sm"
                  >
                    Generate Spell
                  </button>

                  <button
                    onClick={clearSpell}
                    className="px-3 py-2 rounded-lg bg-white/80 backdrop-blur border border-slate-200 text-sm hover:bg-white"
                  >
                    Clear
                  </button>
                </div>

                {/* Preset */}
                <div className="mt-2">
                  <button
                    onClick={() => {
                      const bumrah = roster.find((b) => /bumrah/i.test(b.name));
                      const siraj = roster.find((b) => /siraj/i.test(b.name));
                      const next: SpellItem[] = [];
                      if (bumrah) next.push({ bowlerId: bumrah.id, overs: 4 });
                      if (siraj) next.push({ bowlerId: siraj.id, overs: 4 });
                      setSpell(next);
                    }}
                    className="px-3 py-2 rounded-lg bg-white/80 backdrop-blur border border-slate-200 text-sm hover:bg-white"
                  >
                    Bumrah ×4 + Siraj ×4 (preset)
                  </button>
                </div>

                {/* Spell summary */}
                <div className="mt-3 text-xs text-slate-600">
                  <b>Spell:</b>{" "}
                  {spell.length === 0
                    ? "— (empty)"
                    : spell
                        .map((s, idx) => {
                          const b = getBowlerById(s.bowlerId);
                          return `${idx + 1}. ${b ? b.name : s.bowlerId} × ${s.overs} ov`;
                        })
                        .join("  •  ")}{" "}
                  {spell.length > 0 && `• Total ${totalSpellOvers(spell)} overs`}
                </div>

                {/* Combined spell plan */}
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left uppercase text-[11px] tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Over</th>
                        <th className="px-3 py-2">Bowler</th>
                        <th className="px-3 py-2">Ball</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Length</th>
                        <th className="px-3 py-2">Line</th>
                        <th className="px-3 py-2">Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spellPlan.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                            Build a spell (e.g., Bumrah ×4, Siraj ×4) and click “Generate Spell”.
                          </td>
                        </tr>
                      ) : (
                        spellPlan.map((d, i) => {
                          const bowlerId = spellBowlerByOver[d.over];
                          const b = bowlerId ? getBowlerById(bowlerId) : null;
                          return (
                            <tr
                              key={i}
                              className={i % 2 ? "bg-white" : "bg-slate-50/60"}
                              onClick={() => {
                                if (autoFollow && b) setSelected(b);
                              }}
                              style={{ cursor: autoFollow ? "pointer" : "default" }}
                              title={autoFollow && b ? `Select ${b.name}` : ""}
                            >
                              <td className="px-3 py-2 font-medium">{d.over}</td>
                              <td className="px-3 py-2">{b ? b.name : "—"}</td>
                              <td className="px-3 py-2">{d.ball}</td>
                              <td className="px-3 py-2">{d.type}</td>
                              <td className="px-3 py-2">{d.length}</td>
                              <td className="px-3 py-2">{d.line}</td>
                              <td className="px-3 py-2">{d.pitchPurpose}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Export combined spell */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      if (spellPlan.length === 0) return;
                      const cols = [
                        "over","ball","bowler","country","iplTeam",
                        "type","length","line","purpose","phase","pitch","format",
                      ];
                      const rows = spellPlan.map((p) => {
                        const bid = spellBowlerByOver[p.over];
                        const b = bid ? getBowlerById(bid) : null;
                        return {
                          over: p.over,
                          ball: p.ball,
                          bowler: b?.name || "",
                          country: b?.country || "",
                          iplTeam: b?.iplTeam || "",
                          type: p.type,
                          length: p.length,
                          line: p.line,
                          purpose: p.pitchPurpose,
                          phase,
                          pitch,
                          format,
                        };
                      });
                      const csv = toCSV(rows, cols);
                      download(`spell_${phase}_${pitch}_${format}.csv`, csv);
                    }}
                    className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 shadow-sm inline-flex items-center gap-2"
                    disabled={spellPlan.length === 0}
                  >
                    <Download className="h-4 w-4" />
                    Export Spell (CSV)
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Bowler Profile */}
            <Card className="bg-white/80 backdrop-blur border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-4 w-4" />
                  Bowler Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selected ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="md:col-span-2">
                      <h2 className="text-xl font-semibold text-slate-900">{selected.name}</h2>
                      <p className="text-sm text-slate-700">
                        {selected.country} • {selected.type} •{" "}
                        {selected.arm === "R" ? "Right-arm" : "Left-arm"}
                        {selected.paceKph ? ` • ${selected.paceKph} kph` : ""}
                        {selected.iplTeam ? ` • ${selected.iplTeam}` : ""}
                        {selected.isLegend ? ` • Legend` : ""}
                      </p>
                      <div className="mt-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Strengths
                        </h3>
                        <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                          {selected.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Strategy
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
                        {selected.strategies}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Select a bowler to see details.</div>
                )}
              </CardContent>
            </Card>

            {/* Single Bowler Over Planner */}
            <Card className="bg-white/80 backdrop-blur border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ListChecks className="h-4 w-4" />
                  Over Planner
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
                  <div className="w-44">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Overs to bowl
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={overs}
                      onChange={(e) =>
                        setOvers(Math.min(10, Math.max(1, Number(e.target.value || 1))))
                      }
                      className="bg-white/90"
                    />
                  </div>
                  <div className="text-xs text-slate-600">
                    Auto-generates {overs * 6} deliveries — weighted for wickets & run control.
                  </div>
                  <div className="grow" />
                  <button
                    onClick={exportPlanCSV}
                    className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 shadow-sm inline-flex items-center gap-2"
                    disabled={!selected || !plan.length}
                  >
                    <Download className="h-4 w-4" />
                    Export Plan (CSV)
                  </button>
                </div>

                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left uppercase text-[11px] tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Over</th>
                        <th className="px-3 py-2">Ball</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Length</th>
                        <th className="px-3 py-2">Line</th>
                        <th className="px-3 py-2">Pitch Location / Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                            Select a bowler to generate a plan.
                          </td>
                        </tr>
                      ) : (
                        plan.map((d, i) => (
                          <tr key={i} className={i % 2 ? "bg-white" : "bg-slate-50/60"}>
                            <td className="px-3 py-2 font-medium">{d.over}</td>
                            <td className="px-3 py-2">{d.ball}</td>
                            <td className="px-3 py-2">{d.type}</td>
                            <td className="px-3 py-2">{d.length}</td>
                            <td className="px-3 py-2">{d.line}</td>
                            <td className="px-3 py-2">{d.pitchPurpose}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 text-[11px] text-slate-500">
                  Tip: yorkers appear under <b>Length</b>. A “wide yorker” is <b>Length = yorker</b> + <b>Line = 4th/5th stump</b>.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="mt-8 text-center text-[11px] text-slate-400">
          Prototype — not affiliated with or endorsed by Cricket 24/Big Ant.
        </footer>
      </div>
    </div>
  );
}
