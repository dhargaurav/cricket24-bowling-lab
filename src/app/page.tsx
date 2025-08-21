"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Search, Target, ListChecks, Download, RefreshCw, ExternalLink, FileJson } from "lucide-react";

import { Bowler, DeliveryPlanItem, PhaseId, PitchType } from "@/types/cricket";
import { parseJSONToBowlers } from "@/lib/jsonLoader";
import { buildOverPlan } from "@/lib/overLogic";

// ======= Config (JSON-only) =======
const DEFAULT_JSON_URL =
  "https://raw.githubusercontent.com/dhargaurav/cricket24-roster/refs/heads/main/with_english_players_latest";

const PITCH_TYPES: PitchType[] = ["Normal", "Green", "Dusty", "Dry"];
const PHASES: { id: PhaseId; label: string }[] = [
  { id: "powerplay", label: "Initial Overs (Powerplay)" },
  { id: "middle", label: "Middle Overs" },
  { id: "death", label: "Death Overs" },
];

// ======= helpers =======
function toCSV(rows: any[], columns: string[]): string {
  const esc = (s: any) => {
    const v = String(s ?? "");
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return [columns.join(","), ...rows.map(r => columns.map(c => esc(r[c])).join(","))].join("\n");
}
function download(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function toPlanJSON(bowler: Bowler, phase: PhaseId, pitch: PitchType, plan: DeliveryPlanItem[]) {
  return JSON.stringify({ bowler, phase, pitch, plan }, null, 2);
}

export default function Page() {
  const [format, setFormat] = useState<"ODI" | "T20I" | "Test">("T20I");
  const [phase, setPhase] = useState<PhaseId>("powerplay");
  const [pitch, setPitch] = useState<PitchType>("Normal");
  const [teamFilter, setTeamFilter] = useState("All");
  const [query, setQuery] = useState("");

  const [jsonURL, setJsonURL] = useState(DEFAULT_JSON_URL);
  const [roster, setRoster] = useState<Bowler[]>([]);
  const [banner, setBanner] = useState("");

  const [overs, setOvers] = useState(4);
  const [selected, setSelected] = useState<Bowler | null>(null);
  const [plan, setPlan] = useState<DeliveryPlanItem[]>([]);

  // Load JSON roster
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(jsonURL + (jsonURL.includes("?") ? "&" : "?") + "__t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) throw new Error(`JSON fetch failed (${res.status})`);
        const text = await res.text();
        const list = parseJSONToBowlers(text);
        setRoster(list);
        setBanner(`Loaded ${list.length} players from JSON`);
        setTimeout(() => setBanner(""), 2500);
      } catch (e: any) {
        setBanner("Failed to load JSON: " + (e?.message || String(e)));
        setTimeout(() => setBanner(""), 3500);
      }
    })();
  }, [jsonURL]);

  const teams = useMemo(() => {
    const s = new Set<string>();
    roster.forEach((b) => b.iplTeam && s.add(b.iplTeam));
    return ["All", ...Array.from(s).sort()];
  }, [roster]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    // always apply team filter first
    let list = roster.filter((b) => (teamFilter === "All" ? true : b.iplTeam === teamFilter));

    // build a searchable string
    const matchesQ = (b: Bowler) =>
      (
        b.name +
        " " + (b.country || "") +
        " " + (b.iplTeam || "") +
        " " + b.type +
        " " + (b.strengths || []).join(" ")
      ).toLowerCase().includes(q);

    // if user is typing, IGNORE format filter (search all formats)
    if (q !== "") {
      list = list.filter(matchesQ);
      return list;
    }

    // if no text query, keep the format filter behavior
    list = list
      .filter((b) => (b.formats?.length ? b.formats.includes(format) : true))
      .filter(matchesQ);

    return list;
  }, [roster, format, teamFilter, query]);

  useEffect(() => { if (!selected && filtered.length) setSelected(filtered[0]); }, [filtered, selected]);

  // Generate plan when inputs change
  useEffect(() => {
    if (!selected) return;
    setPlan(buildOverPlan(selected, overs, phase, pitch));
  }, [selected, overs, phase, pitch]);

  function exportPlanCSV() {
    if (!selected || !plan.length) return;
    const cols = ["bowler","phase","pitch","over","ball","type","length","line","purpose"];
    const rows = plan.map((p, i) => ({
      bowler: selected.name, phase, pitch,
      over: p.over, ball: (i % 6) + 1, type: p.type, length: p.length, line: p.line, purpose: p.purpose
    }));
    download(`${selected.name.toLowerCase().replace(/\s+/g,"_")}_${phase}_${pitch}.csv`, toCSV(rows, cols), "text/csv;charset=utf-8");
  }

  function exportPlanJSON() {
    if (!selected || !plan.length) return;
    const content = toPlanJSON(selected, phase, pitch, plan);
    download(`${selected.name.toLowerCase().replace(/\s+/g,"_")}_${phase}_${pitch}.json`, content, "application/json");
  }

  function openPlanInNewTab(list: DeliveryPlanItem[], title: string) {
    if (!list.length) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${title}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Helvetica Neue,Arial,sans-serif;padding:24px}
table{border-collapse:collapse;width:100%;margin-top:10px}
th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left;font-size:14px}
th{background:#f3f4f6}
h2{margin:0 0 12px 0}
.small{color:#64748b;font-size:12px}
</style></head><body>
<h2>${title}</h2>
<div class="small">Phase: ${phase} • Pitch: ${pitch}</div>
<table><thead><tr><th>Over</th><th>Ball</th><th>Type</th><th>Length</th><th>Line</th><th>Purpose</th></tr></thead>
<tbody>
${list.map((p, i) => `<tr><td>${p.over}</td><td>${(i%6)+1}</td><td>${p.type}</td><td>${p.length}</td><td>${p.line}</td><td>${p.purpose}</td></tr>`).join("")}
</tbody></table></body></html>`;
    const w = window.open("", "_blank"); if (!w) return; w.document.write(html); w.document.close();
  }

  return (
    <div className="min-h-screen w-full bg-[radial-gradient(1200px_600px_at_20%_-10%,#c7d2fe_0%,transparent_60%),radial-gradient(1000px_500px_at_110%_10%,#fbcfe8_0%,transparent_55%)] bg-white">
      <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
        {/* Top bar */}
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-indigo-600/90 text-white grid place-content-center shadow-sm">C24</div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">Bowling Strategy Lab</h1>
              <p className="text-xs md:text-sm text-slate-600">JSON roster • strengths-based wicket plans • IPL & legends</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Input className="w-[480px] bg-white/80 backdrop-blur border-slate-200"
              value={jsonURL} onChange={(e) => setJsonURL(e.target.value)} placeholder="JSON URL (GitHub raw)" />
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setJsonURL(jsonURL)}>
              <ExternalLink className="mr-2 h-4 w-4" />Use JSON URL
            </Button>
            <Button variant="outline" className="bg-white/80 backdrop-blur" onClick={() => setJsonURL((u) => u)}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
          </div>
        </div>

        {!!banner && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 px-3 py-2 text-xs shadow-sm">
            {banner}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Left: Bowler list */}
          <Card className="md:col-span-4 lg:col-span-3 bg-white/80 backdrop-blur border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg"><Search className="h-4 w-4" />Bowlers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 grid grid-cols-1 gap-2">
                <Input className="bg-white/90" placeholder="Search name, country, IPL team, type…" value={query}
                  onChange={(e) => setQuery(e.target.value)} />
                <div className="flex gap-2">
                  <Select value={format} onValueChange={(v) => setFormat(v as any)}>
                    <SelectTrigger className="h-9 w-40 bg-white/70 backdrop-blur border-slate-200"><SelectValue placeholder="Format" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="T20I">T20I</SelectItem>
                      <SelectItem value="ODI">ODI</SelectItem>
                      <SelectItem value="Test">Test</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v)}>
                    <SelectTrigger className="h-9 w-40 bg-white/70 backdrop-blur border-slate-200"><SelectValue placeholder="IPL Team" /></SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (<SelectItem key={t} value={t}>{t === "All" ? "All IPL teams" : t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
                {filtered.map((b) => (
                  <button key={b.id} onClick={() => setSelected(b)}
                    className={`flex w-full items-start justify-between px-3 py-2 text-left hover:bg-indigo-50/60 transition ${
                      selected?.id === b.id ? "bg-indigo-50" : "bg-white/70"}`}>
                    <div>
                      <div className="font-medium text-slate-900">
                        {b.name}
                        {b.iplTeam && (<span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">{b.iplTeam}</span>)}
                        {b.isLegend && (<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Legend</span>)}
                      </div>
                      <div className="text-xs text-slate-600">{b.country} • {b.type}</div>
                    </div>
                    <div className="text-xs text-slate-500">{(b.formats || []).join(" · ")}</div>
                  </button>
                ))}
                {filtered.length === 0 && <div className="p-4 text-sm text-slate-500">No bowlers match your search.</div>}
              </div>
            </CardContent>
          </Card>

          {/* Right: Profile + Over planner */}
          <div className="md:col-span-8 lg:col-span-9 flex flex-col gap-6">
            <Card className="bg-white/80 backdrop-blur border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><Target className="h-4 w-4" />Bowler Profile</CardTitle>
              </CardHeader>
              <CardContent>
                {selected ? (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="md:col-span-2">
                      <h2 className="text-xl font-semibold text-slate-900">{selected.name}</h2>
                      <p className="text-sm text-slate-700">
                        {selected.country} • {selected.type} • {selected.arm === "R" ? "Right-arm" : "Left-arm"}
                        {selected.paceKph ? ` • ${selected.paceKph}` : ""}{selected.iplTeam ? ` • ${selected.iplTeam}` : ""}{selected.isLegend ? ` • Legend` : ""}
                      </p>
                      <div className="mt-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strengths</h3>
                        <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                          {(selected.strengths || []).map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strategy</h3>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">
                        {(selected.strategies || []).join(" ") || "Strengths-based patterns tuned by phase/pitch to take quick wickets and control runs."}
                      </p>
                    </div>
                  </div>
                ) : (<div className="text-sm text-slate-500">Select a bowler to see details.</div>)}
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur border-slate-200 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><ListChecks className="h-4 w-4" />Over Planner</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
                  <div className="w-44">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Overs to bowl</label>
                    <Input type="number" min={1} max={10} value={overs}
                      onChange={(e) => setOvers(Math.min(10, Math.max(1, Number(e.target.value || 1))))}
                      className="bg-white/90" />
                  </div>

                  <Select value={phase} onValueChange={(v) => setPhase(v as PhaseId)}>
                    <SelectTrigger className="w-56 bg-white/70 backdrop-blur border-slate-200">
                      <SelectValue placeholder="Phase" />
                    </SelectTrigger>
                    <SelectContent>
                      {PHASES.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={pitch} onValueChange={(v) => setPitch(v as PitchType)}>
                    <SelectTrigger className="w-40 bg-white/70 backdrop-blur border-slate-200">
                      <SelectValue placeholder="Pitch" />
                    </SelectTrigger>
                    <SelectContent>
                      {PITCH_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <div className="grow" />
                  <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={exportPlanCSV} disabled={!plan.length}>
                    <Download className="mr-2 h-4 w-4" />Export CSV
                  </Button>
                  {/* Removed the export to JSON button from the webpage */}
                  {/* <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={exportPlanJSON} disabled={!plan.length}>
                    <FileJson className="mr-2 h-4 w-4" />Export JSON
                  </Button> */}
                  <Button variant="outline" onClick={() => openPlanInNewTab(plan, "Over Planner Export")} disabled={!plan.length}>
                    Open plan in new tab
                  </Button>
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
                        <th className="px-3 py-2">Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.map((d, i) => (
                        <tr key={i} className={i % 2 ? "bg-white" : "bg-slate-50/60"}>
                          <td className="px-3 py-2 font-medium">{d.over}</td>
                          <td className="px-3 py-2">{(i % 6) + 1}</td>
                          <td className="px-3 py-2">{d.type}</td>
                          <td className="px-3 py-2">{d.length}</td>
                          <td className="px-3 py-2">{d.line}</td>
                          <td className="px-3 py-2">{d.purpose}</td>
                        </tr>
                      ))}
                      {plan.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Select a bowler to generate a plan.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 text-[11px] text-slate-500">
                  Tip: Wide yorkers appear when <b>Length</b> is <b>Yorker</b> and <b>Line</b> is <b>Outside off</b> / <b>Wide outside off</b>.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <footer className="mt-8 text-center text-[11px] text-slate-400">Prototype — not affiliated with or endorsed by Cricket 24/Big Ant.</footer>
      </div>
    </div>
  );
}
