"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { CheckCircle2, Maximize2, RotateCcw, Square, Trophy, Wifi, WifiOff, X, Pause, Play, Volume2, VolumeX, Settings2, ArrowDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { emptyLedger, emptyStats, restoreLedger, recordResult, totalStats, validDraw, type Ledger } from "@/lib/simulation";

type Wins = [number, number, number, number, number, number, number];
type Prize = { tier: number; dividend: number; winningUnit: number };
type Draw = { drawNo: string; drawDate: string; numbers: number[]; extra: number; prizes: Prize[]; updatedFromOfficial: boolean; fetchedAt?: string; lastAttemptAt?: string; updateError?: boolean };
type Stats = { entries: number; cost: number; prize: number; wins: Wins };
type BetResult = { entries: number; cost: number; prize: number; wins: Wins; label: string; picks?: number[][] };
type AutoProgress = { completed: number; total: number; cost: number; prize: number; wins: Wins };
type AutoSummary = AutoProgress & { requested: number; hitEntries: number[][]; cancelled: boolean };
type AutoTicket = { entry: number; numbers: number[]; tier: number; status: "drawing" | "settled" };

const EMPTY_WINS: Wins = [0, 0, 0, 0, 0, 0, 0];
const EMPTY_STATS: Stats = { entries: 0, cost: 0, prize: 0, wins: EMPTY_WINS };
const DEFAULT_ALERT_TIERS = [true, true, true, true, true, true, true];
const FALLBACK_DRAW: Draw = {
  drawNo: "26/095", drawDate: "2026-08-29", numbers: [4, 7, 8, 11, 26, 30], extra: 42, updatedFromOfficial: false,
  prizes: [
    { tier: 1, dividend: 4_149_710, winningUnit: 7 }, { tier: 2, dividend: 301_160, winningUnit: 3 },
    { tier: 3, dividend: 19_200, winningUnit: 432.5 }, { tier: 4, dividend: 9_600, winningUnit: 379.5 },
    { tier: 5, dividend: 640, winningUnit: 14_764.5 }, { tier: 6, dividend: 320, winningUnit: 8_645 },
    { tier: 7, dividend: 40, winningUnit: 188_816.6 },
  ],
};
const TIER_NAMES = ["頭獎", "二獎", "三獎", "四獎", "五獎", "六獎", "七獎"];
const TIER_RULES = ["6個正選", "5個正選＋特別號", "5個正選", "4個正選＋特別號", "4個正選", "3個正選＋特別號", "3個正選"];
const RED = new Set([1, 2, 7, 8, 12, 13, 18, 19, 23, 24, 29, 30, 34, 35, 40, 45, 46]);
const BLUE = new Set([3, 4, 9, 10, 14, 15, 20, 25, 26, 31, 36, 37, 41, 42, 47, 48]);
const DRAW_CYCLE_MS = 1100;

function ballColor(n: number) { return RED.has(n) ? "red" : BLUE.has(n) ? "blue" : "green"; }
function money(value: number) { return new Intl.NumberFormat("zh-HK", { style: "currency", currency: "HKD", maximumFractionDigits: 0 }).format(value); }
function quickPick() {
  const pool = Array.from({ length: 49 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 6).sort((a, b) => a - b);
}
function classify(numbers: number[], draw: Draw): number {
  const regular = numbers.filter((n) => draw.numbers.includes(n)).length; const extra = numbers.includes(draw.extra);
  if (regular === 6) return 0; if (regular === 5 && extra) return 1; if (regular === 5) return 2;
  if (regular === 4 && extra) return 3; if (regular === 4) return 4; if (regular === 3 && extra) return 5; if (regular === 3) return 6; return -1;
}
function prizeTotal(wins: Wins, draw: Draw, stake: number) {
  return wins.reduce((sum, count, index) => sum + count * (draw.prizes.find((p) => p.tier === index + 1)?.dividend ?? 0) * (stake / 10), 0);
}
function wait(ms: number) { return new Promise<void>((resolve) => window.setTimeout(resolve, ms)); }
function Ball({ number, extra = false, small = false, muted = false }: { number: number; extra?: boolean; small?: boolean; muted?: boolean }) {
  return <span className={`ball ball-${ballColor(number)} ${extra ? "ball-extra" : ""} ${small ? "ball-small" : ""} ${muted ? "ball-muted" : ""}`}><span className="ball-number">{number}</span></span>;
}
function usePersistentStats(drawKey: string) {
  const [ledger, setLedger] = useState<Ledger>(emptyLedger);
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(false);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    try {
      setLedger(restoreLedger(localStorage.getItem("mark-six-ledger-v2"), localStorage.getItem("mark-six-sim-stats-v1")));
      setWritable(true);
    } catch { setStorageError("未能讀取舊戰績，原有資料已保留；今次戰績暫存於本頁。"); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || !writable) return;
    try { localStorage.setItem("mark-six-ledger-v2", JSON.stringify(ledger)); }
    catch { setStorageError("未能儲存戰績，請保持本頁開啟。"); }
  }, [ledger, ready, writable]);
  const add = useCallback((result: Stats) => setLedger(old => recordResult(old, drawKey, result)), [drawKey]);
  const reset = () => setLedger(old => ({ ...old, draws: { ...old.draws, [drawKey]: emptyStats() } }));
  return { stats: ledger.draws[drawKey] ?? EMPTY_STATS, allStats: totalStats(ledger), add, reset, ready, storageError, hasLegacy: ledger.legacy.entries > 0 };
}
function timeLabel(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "未有成功更新紀錄";
  return new Date(value).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) + "（香港）";
}

export default function Home() {
  const [draw, setDraw] = useState<Draw>(FALLBACK_DRAW); const [loadingDraw, setLoadingDraw] = useState(true);
  const [quickCount, setQuickCount] = useState(10);
  const { stats: periodStats, allStats, add: addStats, reset: resetStats, ready: statsReady, storageError, hasLegacy } = usePersistentStats(`${draw.drawDate}:${draw.drawNo}`);
  const [statsScope, setStatsScope] = useState("period");
  const stats = statsScope === "period" ? periodStats : allStats;
  const [settingsOpen, setSettingsOpen] = useState(false); const [resetOpen, setResetOpen] = useState(false);
  const [updateNotice, setUpdateNotice] = useState("");
  const [muted, setMuted] = useState(false); const mutedRef = useRef(false);
  const [speed, setSpeed] = useState(1); const speedRef = useRef(1);
  const [cycleMs, setCycleMs] = useState(DRAW_CYCLE_MS);
  const [density, setDensity] = useState("comfortable");
  const [paused, setPaused] = useState(false); const pausedRef = useRef(false);
  const [followLive, setFollowLive] = useState(true); const followLiveRef = useRef(true);
  const [stopping, setStopping] = useState(false); const busyRef = useRef(false);
  const mountedRef = useRef(true); const drawRef = useRef(draw);
  const [lastPicks, setLastPicks] = useState<number[][]>([]); const [lastLabel, setLastLabel] = useState("尚未投注");
  const [winnerOpen, setWinnerOpen] = useState(false); const [lastWin, setLastWin] = useState<BetResult | null>(null);
  const [alertTiers, setAlertTiers] = useState<boolean[]>(DEFAULT_ALERT_TIERS); const [lastTriggeredTier, setLastTriggeredTier] = useState(-1);
  const [showFrozenDraw, setShowFrozenDraw] = useState(false); const [isDrawing, setIsDrawing] = useState(false);
  const [autoMode, setAutoMode] = useState(false); const [autoTotal, setAutoTotal] = useState(100); const [autoFullscreen, setAutoFullscreen] = useState(true);
  const [autoRunning, setAutoRunning] = useState(false); const [autoTickets, setAutoTickets] = useState<AutoTicket[]>([]);
  const [autoProgress, setAutoProgress] = useState<AutoProgress>({ completed: 0, total: 100, cost: 0, prize: 0, wins: EMPTY_WINS });
  const [autoHitEntries, setAutoHitEntries] = useState<number[][]>(Array.from({ length: 7 }, () => [])); const [autoSummary, setAutoSummary] = useState<AutoSummary | null>(null);
  const [focusedEntry, setFocusedEntry] = useState<number | null>(null);
  const drawPanelRef = useRef<HTMLDivElement>(null); const autoTicketGridRef = useRef<HTMLDivElement>(null); const cancelAutoRef = useRef(false); const audioContextRef = useRef<AudioContext | null>(null);
  const marbleAudioRef = useRef<HTMLAudioElement | null>(null); const marbleStopTimerRef = useRef<number | null>(null);
  const tierCursorRef = useRef<number[]>(Array(7).fill(0)); const focusTimerRef = useRef<number | null>(null);

  const loadLatest = useCallback(async () => {
    if (busyRef.current) return;
    setLoadingDraw(true); setUpdateNotice("");
    try {
      const endpoint = window.location.hostname.endsWith("github.io") ? new URL("latest-result.json", window.location.href).toString() : "/api/latest-result";
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("unavailable");
      const incoming: Draw = await response.json();
      if (!validDraw(incoming)) throw new Error("invalid");
      const existing = drawRef.current;
      // Never replace a newer saved draw with an older build-time fallback.
      const keepExisting = incoming.drawDate < existing.drawDate || (!incoming.updatedFromOfficial && existing.updatedFromOfficial);
      const next = keepExisting ? existing : incoming;
      drawRef.current = next; setDraw(next);
      if (!keepExisting && next.drawNo !== existing.drawNo) { setLastPicks([]); setLastLabel("尚未投注"); }
      if (keepExisting || incoming.updateError || !incoming.updatedFromOfficial) {
        setUpdateNotice("未能取得最新官方資料，正使用已儲存結果。");
      } else if (incoming.fetchedAt && Date.now() - Date.parse(incoming.fetchedAt) > 12 * 60 * 60 * 1000) {
        setUpdateNotice("資料已超過 12 小時未成功更新，未必係最近一期。");
      } else if (!incoming.fetchedAt) {
        setUpdateNotice("官方資料快照未附更新時間，未能確認是否最新。");
      }
      try { localStorage.setItem("mark-six-last-draw-v2", JSON.stringify(next)); } catch {}
    } catch { setUpdateNotice("更新失敗，正保留已儲存結果；稍後可再試。"); }
    finally { setLoadingDraw(false); }
  }, []);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mark-six-last-draw-v2") || "null");
      if (validDraw(saved)) { drawRef.current = saved; setDraw(saved); }
      const prefs = JSON.parse(localStorage.getItem("mark-six-playback-v1") || "{}");
      if (typeof prefs.muted === "boolean") { mutedRef.current = prefs.muted; setMuted(prefs.muted); }
      if ([0.5, 1, 2].includes(prefs.speed)) { speedRef.current = prefs.speed; setSpeed(prefs.speed); }
      if (["comfortable", "dense"].includes(prefs.density)) setDensity(prefs.density);
    } catch {}
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(loadLatest, 0);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(new URL("sw.js", window.location.href)).catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, [loadLatest]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("mark-six-alert-tiers-v1");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === 7) setAlertTiers(parsed.map(Boolean));
        }
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { mountedRef.current = true; return () => {
    mountedRef.current = false; cancelAutoRef.current = true; marbleAudioRef.current?.pause();
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    if (marbleStopTimerRef.current !== null) window.clearTimeout(marbleStopTimerRef.current);
  }; }, []);
  useEffect(() => {
    if (!autoRunning || !followLiveRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const grid = autoTicketGridRef.current;
      if (grid) grid.scrollTo({ top: grid.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoRunning, autoTickets.length, isDrawing, followLive]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const panel = drawPanelRef.current;
        const header = document.querySelector<HTMLElement>(".topbar");
        if (panel && header) setShowFrozenDraw(panel.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom);
      });
    };
    const timer = window.setTimeout(update, 0);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.clearTimeout(timer); window.cancelAnimationFrame(frame); window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);

  function playSound(kind: "spin" | "settle" | "coin", duration = DRAW_CYCLE_MS) {
    if (mutedRef.current) return;
    if (kind === "spin") {
      const audio = marbleAudioRef.current ?? new Audio(new URL("sounds/marbles.mp3", window.location.href).toString());
      marbleAudioRef.current = audio; audio.preload = "auto"; audio.volume = 0.68;
      if (marbleStopTimerRef.current !== null) window.clearTimeout(marbleStopTimerRef.current);
      audio.pause();
      try { audio.currentTime = Number.isFinite(audio.duration) ? Math.random() * Math.max(0, audio.duration - duration / 1000) : 0; } catch { audio.currentTime = 0; }
      void audio.play().catch(() => undefined);
      marbleStopTimerRef.current = window.setTimeout(() => { audio.pause(); }, duration - 30);
      return;
    }
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = audioContextRef.current ?? new AudioCtor(); audioContextRef.current = context;
    void context.resume(); const now = context.currentTime + 0.01;
    if (kind === "coin") {
      [988, 1319, 1568, 2093].forEach((frequency, index) => {
        const start = now + index * 0.065; const duration = 0.34 - index * 0.025;
        [1, 2.02].forEach((multiple, harmonic) => {
          const oscillator = context.createOscillator(); const gain = context.createGain();
          oscillator.type = harmonic ? "triangle" : "sine"; oscillator.frequency.setValueAtTime(frequency * multiple, start);
          gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(harmonic ? 0.018 : 0.052, start + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + duration);
        });
      });
      return;
    }
    [784, 1175].forEach((frequency, index) => { const oscillator = context.createOscillator(); const gain = context.createGain(); const start = now + index * 0.055; oscillator.type = "sine"; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28); oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + 0.3); });
  }

  const addResult = useCallback((result: BetResult, allowPopup = true) => {
    addStats(result);
    setLastLabel(result.label); const hasWin = result.wins.some(Boolean);
    if (hasWin) {
      setLastWin(result);
      const triggeredTier = result.wins.findIndex((count, index) => count > 0 && alertTiers[index]);
      setLastTriggeredTier(triggeredTier);
      if (allowPopup && triggeredTier >= 0) setWinnerOpen(true);
    }
    return hasWin;
  }, [alertTiers, addStats]);

  const randomBet = useCallback((count: number, showPicks = true): BetResult => {
    const picks = Array.from({ length: count }, quickPick); const wins = [...EMPTY_WINS] as Wins;
    picks.forEach((pick) => { const tier = classify(pick, draw); if (tier >= 0) wins[tier] += 1; }); if (showPicks) setLastPicks(picks);
    return { entries: count, cost: count * 10, prize: prizeTotal(wins, draw, 10), wins, label: `${count.toLocaleString("zh-HK")} 注隨機號碼`, picks };
  }, [draw]);

  async function placeBet() {
    if (busyRef.current || loadingDraw || !statsReady) return;
    busyRef.current = true;
    const result = randomBet(quickCount, false);
    if (result.picks) setLastPicks(result.picks);
    const duration = DRAW_CYCLE_MS / speedRef.current; setCycleMs(duration);
    playSound("spin", duration); setIsDrawing(true);
    await wait(duration);
    playSound(result.wins.some(Boolean) ? "coin" : "settle"); addResult(result);
    setIsDrawing(false); busyRef.current = false;
  }
  async function runUntilWin() {
    if (busyRef.current || loadingDraw || !statsReady) return;
    busyRef.current = true;
    let attempts = 0, entries = 0, cost = 0, prize = 0; const wins = [...EMPTY_WINS] as Wins; let latest: BetResult;
    do { latest = randomBet(quickCount, false); attempts += 1; entries += latest.entries; cost += latest.cost; prize += latest.prize; latest.wins.forEach((v, i) => wins[i] += v); }
    while (!latest.wins.some(Boolean) && attempts < 100_000);
    setLastPicks(latest.picks ?? []);
    const duration = DRAW_CYCLE_MS / speedRef.current; setCycleMs(duration);
    playSound("spin", duration); setIsDrawing(true); await wait(duration);
    playSound(wins.some(Boolean) ? "coin" : "settle"); addResult({ entries, cost, prize, wins, label: "連續投注至中獎" });
    setIsDrawing(false); busyRef.current = false;
  }
  async function startAutoBet() {
    if (busyRef.current || loadingDraw || !statsReady) return;
    busyRef.current = true;
    const requested = Math.max(10, Math.min(100_000, Math.round((Math.floor(autoTotal) || 10) / 10) * 10));
    const perRound = Math.max(5, Math.min(100, Math.round((Math.floor(quickCount) || 5) / 5) * 5));
    cancelAutoRef.current = false; pausedRef.current = false; setPaused(false); setStopping(false); followLiveRef.current = true; setFollowLive(true);
    tierCursorRef.current = Array(7).fill(0); setFocusedEntry(null);
    setAutoTotal(requested); setWinnerOpen(false); setAutoSummary(null); setAutoRunning(true); setAutoTickets([]);
    const emptyHits = Array.from({ length: 7 }, () => [] as number[]);
    setAutoHitEntries(emptyHits);
    setAutoProgress({ completed: 0, total: requested, cost: 0, prize: 0, wins: [...EMPTY_WINS] as Wins });
    if (autoFullscreen && document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
    let completed = 0, cost = 0, prize = 0;
    const wins = [...EMPTY_WINS] as Wins; const hits = Array.from({ length: 7 }, () => [] as number[]);
    while (completed < requested && !cancelAutoRef.current && mountedRef.current) {
      while (pausedRef.current && !cancelAutoRef.current && mountedRef.current) await wait(80);
      if (cancelAutoRef.current || !mountedRef.current) break;
      const duration = DRAW_CYCLE_MS / speedRef.current; setCycleMs(duration);
      const batch = Math.min(perRound, requested - completed); const result = randomBet(batch, false); const picks = result.picks ?? [];
      const roundStart = completed + 1;
      const roundTickets = picks.map((pick, index) => ({ entry: roundStart + index, numbers: pick, tier: classify(pick, draw), status: "drawing" as const }));
      playSound("spin", duration); setAutoTickets((old) => [...old, ...roundTickets]); setIsDrawing(true);
      await wait(duration);
      if (!mountedRef.current) return;
      playSound(result.wins.some(Boolean) ? "coin" : "settle");
      setAutoTickets((old) => old.map((ticket) => ticket.entry >= roundStart && ticket.entry < roundStart + batch ? { ...ticket, status: "settled" } : ticket));
      setIsDrawing(false);
      picks.forEach((pick, index) => { const tier = classify(pick, draw); if (tier >= 0) hits[tier].push(completed + index + 1); });
      completed += batch; cost += result.cost; prize += result.prize; result.wins.forEach((value, index) => { wins[index] += value; });
      setAutoHitEntries(hits.map((row) => [...row]));
      setAutoProgress({ completed, total: requested, cost, prize, wins: [...wins] as Wins });
      setLastPicks(picks); addResult(result, false);
      await wait(260 / speedRef.current);
    }
    setIsDrawing(false); setAutoRunning(false); busyRef.current = false; pausedRef.current = false; setPaused(false); setStopping(false);
    setAutoSummary({ requested, completed, total: requested, cost, prize, wins: [...wins] as Wins, hitEntries: hits.map((row) => [...row]), cancelled: cancelAutoRef.current });
  }
  function stopAutoBet() { cancelAutoRef.current = true; setStopping(true); }
  function togglePause() { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); }
  function stopFollowing() { followLiveRef.current = false; setFollowLive(false); }
  function resumeFollowing() {
    followLiveRef.current = true; setFollowLive(true);
    autoTicketGridRef.current?.scrollTo({ top: autoTicketGridRef.current.scrollHeight, behavior: "smooth" });
  }
  function savePlayback(next: { muted: boolean; speed: number; density: string }) {
    try { localStorage.setItem("mark-six-playback-v1", JSON.stringify(next)); } catch {}
  }
  function toggleMute() {
    const next = !mutedRef.current; mutedRef.current = next; setMuted(next);
    if (next) { marbleAudioRef.current?.pause(); void audioContextRef.current?.suspend(); }
    else void audioContextRef.current?.resume();
    savePlayback({ muted: next, speed: speedRef.current, density });
  }
  function changeSpeed(value: string) {
    const next = Number(value); speedRef.current = next; setSpeed(next);
    savePlayback({ muted: mutedRef.current, speed: next, density });
  }
  function playbackControls(inAuto = false) {
    return <div className="playback-controls">
      {inAuto && autoRunning && <button className="control-button pause-button" onClick={togglePause} disabled={stopping} aria-label={paused ? "繼續自動投注" : "暫停自動投注"}>{paused ? <Play size={16}/> : <Pause size={16}/>}<span>{paused ? "繼續" : "暫停"}</span></button>}
      <Select value={String(speed)} onValueChange={changeSpeed}><SelectTrigger className="speed-select" aria-label="播放速度"><SelectValue>{speed}× {speed === 0.5 ? "慢速" : speed === 2 ? "快速" : "標準"}</SelectValue></SelectTrigger><SelectContent position="popper"><SelectItem value="0.5">0.5× 慢速</SelectItem><SelectItem value="1">1× 標準</SelectItem><SelectItem value="2">2× 快速</SelectItem></SelectContent></Select>
      <button className="control-button" onClick={toggleMute} aria-label={muted ? "開啟音效" : "靜音"} aria-pressed={muted}>{muted ? <VolumeX size={18}/> : <Volume2 size={18}/>}</button>
      {inAuto && <button className="control-button follow-button" onClick={followLive ? stopFollowing : resumeFollowing} aria-pressed={followLive}><ArrowDown size={15}/><span>{followLive ? "跟隨最新" : "返回最新"}</span></button>}
    </div>;
  }
  async function closeAutoSummary() {
    setLastPicks([]); setLastLabel(autoSummary?.cancelled ? "自動投注已停止" : "自動投注已完成");
    setAutoSummary(null); setAutoTickets([]); setFocusedEntry(null); tierCursorRef.current = Array(7).fill(0);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }
  function jumpToTier(index: number, entries: number[]) {
    if (!entries.length) return;
    stopFollowing();
    const cursor = tierCursorRef.current[index] % entries.length;
    const entry = entries[cursor];
    tierCursorRef.current[index] = (cursor + 1) % entries.length;
    setFocusedEntry(entry);
    window.requestAnimationFrame(() => {
      const grid = autoTicketGridRef.current;
      const target = grid?.querySelector<HTMLElement>(`[data-entry="${entry}"]`);
      if (!grid || !target) return;
      const gridRect = grid.getBoundingClientRect(); const targetRect = target.getBoundingClientRect();
      const targetTop = grid.scrollTop + targetRect.top - gridRect.top - grid.clientHeight / 2 + targetRect.height / 2;
      grid.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    });
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => {
      setFocusedEntry((current) => current === entry ? null : current);
      focusTimerRef.current = null;
    }, 1600);
  }
  function setTierAlert(index: number, enabled: boolean) {
    const next = alertTiers.map((value, tier) => tier === index ? enabled : value);
    setAlertTiers(next);
    try { localStorage.setItem("mark-six-alert-tiers-v1", JSON.stringify(next)); } catch {}
  }

  const displayedAuto = autoSummary ?? autoProgress;

  return <main className={`app-shell density-${density}`} style={{ "--draw-duration": `${cycleMs}ms` } as CSSProperties}>
    <header className="topbar"><div className="brand-mark"><span>6</span><i>+</i></div><div><p className="eyebrow">MARK SIX LAB</p><h1>六合彩模擬器</h1></div><button className="icon-button settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="開啟設定"><Settings2 size={19}/></button><button className="icon-button" disabled={loadingDraw || isDrawing || autoRunning || !!autoSummary} onClick={loadLatest} aria-label="更新最新攪珠結果"><RotateCcw className={loadingDraw ? "spin" : ""} size={19} /></button></header>
    <div className={`frozen-draw ${showFrozenDraw && !autoRunning && !autoSummary ? "visible" : ""}`} aria-hidden={!showFrozenDraw}>
      <span>第 {draw.drawNo} 期</span><div className="frozen-balls">{draw.numbers.map((n) => <Ball key={n} number={n} small />)}<b>+</b><Ball number={draw.extra} extra small /></div>
    </div>
    <div className="content-grid">
        <section className="summary-card"><div className="card-title-row"><div><span className="section-kicker">模擬戰績</span><h2>{statsScope === "period" ? "本期戰績" : "歷來戰績"}</h2></div><div className="stats-actions"><Tabs value={statsScope} onValueChange={setStatsScope}><TabsList aria-label="戰績範圍"><TabsTrigger value="period">本期</TabsTrigger><TabsTrigger value="all">歷來</TabsTrigger></TabsList></Tabs>{statsScope === "period" && <button className="text-button danger" disabled={isDrawing || autoRunning || !statsReady} onClick={() => setResetOpen(true)}>重設本期</button>}</div></div>
          <div className="money-grid compact"><div><span>總投注成本</span><strong>{money(stats.cost)}</strong></div><div><span>中獎獎金</span><strong className="gold">{money(stats.prize)}</strong></div><div><span>淨結果</span><strong className={stats.prize - stats.cost >= 0 ? "positive" : "negative"}>{money(stats.prize - stats.cost)}</strong></div></div>
          <div className="stat-strip compact"><span><b>{stats.entries.toLocaleString("zh-HK")}</b> 總注數</span><span><b>{stats.wins.reduce((a, b) => a + b, 0).toLocaleString("zh-HK")}</b> 中獎注數</span></div><p className="local-note">戰績儲存於此瀏覽器。{statsScope === "all" && hasLegacy ? "包含未分期嘅舊版戰績。" : ""}</p>{storageError && <p className="update-notice" role="status">{storageError}</p>}</section>

      <section className="bet-card">
        <div ref={drawPanelRef} className="draw-panel"><div className="draw-meta"><div><span className="section-kicker">最近一期攪珠</span><strong>第 {draw.drawNo} 期</strong></div><div className={`source-pill ${draw.updatedFromOfficial ? "online" : "offline"}`}>{draw.updatedFromOfficial ? <Wifi size={13} /> : <WifiOff size={13} />}{draw.updatedFromOfficial ? "官方資料快照" : "已儲存資料"}</div></div>
          <div className="draw-balls" aria-label={`攪珠結果 ${draw.numbers.join("、")}，特別號 ${draw.extra}`}>{draw.numbers.map((n) => <Ball key={n} number={n} />)}<span className="plus">+</span><Ball number={draw.extra} extra /></div><p className="draw-date">{draw.drawDate.replaceAll("-", "/")} · 特別號碼以金圈標示</p><p className="update-time">{loadingDraw ? "正在檢查最新資料…" : `上次成功更新：${timeLabel(draw.fetchedAt)}`}</p>{updateNotice && <p className="update-notice" role="status">{updateNotice}</p>}</div>
        <div className="ticket-panel">
          <div className="ticket-heading"><div><span className="section-kicker">隨機投注</span><strong>{lastLabel}</strong></div></div>
          <div className="mode-content random-only"><div className="counter-row"><div><span>每批注數</span><p>每次以 5 注調整</p></div><div className="stepper"><button onClick={() => setQuickCount(Math.max(5, quickCount - 5))} aria-label="減少 5 注">−</button><strong>{quickCount}</strong><button onClick={() => setQuickCount(Math.min(100, quickCount + 5))} aria-label="增加 5 注">＋</button></div></div>
            <label className="auto-toggle"><span><b>自動投注</b><small>按每批注數自動完成</small></span><Switch checked={autoMode} onCheckedChange={setAutoMode} aria-label="開啟自動投注" /></label>
            {autoMode && <div className="auto-config"><label><span>總注數</span><div className="auto-total-control"><button type="button" onClick={() => setAutoTotal(Math.max(10, autoTotal - 10))} aria-label="減少 10 注">−</button><input type="number" inputMode="numeric" min={10} max={100000} step={10} value={autoTotal} onChange={(event) => setAutoTotal(Math.max(10, Math.min(100000, Math.floor(Number(event.target.value)) || 10)))} onBlur={() => setAutoTotal(Math.max(10, Math.min(100000, Math.round(autoTotal / 10) * 10)))} aria-label="自動投注總注數" /><button type="button" onClick={() => setAutoTotal(Math.min(100000, Math.round(autoTotal / 10) * 10 + 10))} aria-label="增加 10 注">＋</button></div></label><label className="fullscreen-option"><span><Maximize2 size={15} /> 全螢幕播放</span><Switch checked={autoFullscreen} onCheckedChange={setAutoFullscreen} aria-label="自動投注全螢幕" /></label></div>}
            {playbackControls()}
            <div className="last-picks">{lastPicks.length ? lastPicks.map((pick, i) => { const tier = classify(pick, draw); const drawing = isDrawing && !autoRunning; const winner = !drawing && tier >= 0; return <div className={`pick-row ${drawing ? "drawing" : winner ? "winning" : "losing"}`} key={`${pick.join("-")}-${i}`}><span className="pick-index">{i + 1}</span><div className="pick-balls">{pick.map((n) => <Ball key={n} number={n} small extra={winner && n === draw.extra} muted={winner && !draw.numbers.includes(n) && n !== draw.extra} />)}</div><em>{drawing ? "開彩中" : winner ? TIER_NAMES[tier] : "未中"}</em></div>; }) : <div className="empty-pick">{autoMode ? "按「開始自動」逐批揭曉號碼" : "按「投注一次」即時產生號碼"}</div>}</div>
          </div>
          <div className="action-dock"><div className="cost-preview"><span>{autoMode ? "自動投注總計" : "今次投注"}</span><strong>{(autoMode ? autoTotal : quickCount).toLocaleString("zh-HK")} 注 · {money((autoMode ? autoTotal : quickCount) * 10)}</strong></div><button className="secondary-action" disabled={isDrawing || autoRunning || loadingDraw || !statsReady} onClick={autoMode ? placeBet : runUntilWin}>{autoMode ? "投注一批" : "連續至中獎"}</button><button className="primary-action" disabled={isDrawing || autoRunning || loadingDraw || !statsReady} onClick={autoMode ? startAutoBet : placeBet}>{isDrawing ? "開彩中…" : autoMode ? "開始自動" : "投注一次"}</button></div>
        </div>
      </section>
      <aside className="stats-column">
        <section className="prize-card"><div className="card-title-row"><div><span className="section-kicker">當期派彩</span><h2>各獎級結果</h2></div><span className="unit-note">每 $10 注項</span></div><div className="prize-list">
          {TIER_NAMES.map((name, index) => { const prize = draw.prizes.find((p) => p.tier === index + 1); return <div className={`prize-row ${periodStats.wins[index] ? "won" : ""}`} key={name}><div className="tier-badge">{index + 1}</div><div className="tier-name"><strong>{name}</strong><span>{TIER_RULES[index]}</span></div><div className="tier-official"><strong>{money(prize?.dividend ?? 0)}</strong><span>{(prize?.winningUnit ?? 0).toLocaleString("zh-HK")} 注中</span></div><div className="tier-yours"><strong>{periodStats.wins[index].toLocaleString("zh-HK")}</strong><span>本期中</span></div></div>; })}
        </div></section>
      </aside>
    </div>
    <Dialog open={autoRunning || !!autoSummary} onOpenChange={open => { if (!open && !autoRunning) void closeAutoSummary(); }}><DialogContent className={`auto-overlay density-${density}`} style={{ "--draw-duration": `${cycleMs}ms` } as CSSProperties} showCloseButton={false} aria-label="自動投注" aria-describedby={undefined} onEscapeKeyDown={event => { if (autoRunning) event.preventDefault(); }}>
      <DialogTitle className="sr-only">自動投注</DialogTitle>
      <header className="auto-header"><div><span>AUTO DRAW</span><strong>{autoSummary && <CheckCircle2 size={17} />}{autoRunning ? stopping ? "正完成最後一批" : paused ? isDrawing ? "完成本批後暫停" : "自動投注已暫停" : "自動投注進行中" : autoSummary?.cancelled ? "自動投注已停止" : "自動投注完成"}</strong></div>{playbackControls(true)}<button disabled={stopping} onClick={autoRunning ? stopAutoBet : closeAutoSummary} aria-label={autoRunning ? "停止自動投注" : "關閉總結"}>{autoRunning ? <Square size={18} /> : <X size={21} />}</button></header>
      <div className="auto-draw-stage"><span>第 {draw.drawNo} 期攪珠結果</span><div className="auto-static-balls">{draw.numbers.map((n) => <Ball key={n} number={n} />)}<b>+</b><Ball number={draw.extra} extra /></div><small>{isDrawing ? "投注號碼開彩中…" : autoRunning ? paused ? "已暫停，可翻睇注項" : "準備下一批投注" : "所有投注已完成，可捲動查看"}</small></div>
      <div className="auto-progress-card"><div className="progress-heading"><span>{autoSummary ? autoSummary.cancelled ? "已停止" : "已完成" : "進度"}</span><strong>{displayedAuto.completed.toLocaleString("zh-HK")} / {displayedAuto.total.toLocaleString("zh-HK")} 注</strong></div><div className="progress-track"><i style={{ width: `${Math.min(100, displayedAuto.completed / displayedAuto.total * 100)}%` }} /></div><div className={`auto-metrics no-round ${autoSummary ? "has-net" : ""}`}><span>成本 <b>{money(displayedAuto.cost)}</b></span><span>獎金 <b>{money(displayedAuto.prize)}</b></span>{autoSummary && <span>淨額 <b className={displayedAuto.prize - displayedAuto.cost >= 0 ? "positive" : "negative"}>{money(displayedAuto.prize - displayedAuto.cost)}</b></span>}</div></div>
      <div ref={autoTicketGridRef} className="auto-ticket-grid" onWheel={stopFollowing} onTouchStart={stopFollowing} onPointerDown={stopFollowing}>{autoTickets.map((ticket) => { const winner = ticket.status === "settled" && ticket.tier >= 0; return <div data-entry={ticket.entry} className={`auto-pick-card ${ticket.status === "drawing" ? "drawing" : winner ? "winning" : "losing"} ${focusedEntry === ticket.entry ? "tier-focused" : ""}`} key={ticket.entry}><div className="ticket-meta"><span>#{ticket.entry}</span><em>{ticket.status === "drawing" ? "開彩中" : winner ? TIER_NAMES[ticket.tier] : "未中"}</em></div><div className="ticket-balls">{ticket.numbers.map((n) => <Ball key={n} number={n} small extra={winner && n === draw.extra} muted={winner && !draw.numbers.includes(n) && n !== draw.extra} />)}</div></div>; })}</div>
      <div className={`auto-footer-panel ${autoSummary ? "complete" : ""}`}><div className="auto-live-hits"><div>{alertTiers.map((enabled, index) => { if (!enabled) return null; const entries = autoSummary ? autoSummary.hitEntries[index] : autoHitEntries[index]; return <button type="button" className={`tier-jump ${entries.length ? "hit" : ""}`} disabled={!entries.length} onClick={() => jumpToTier(index, entries)} aria-label={`${TIER_NAMES[index]}，${entries.length ? `中 ${entries.length} 注，跳到下一張中獎票` : "未中"}`} key={TIER_NAMES[index]}><b>{TIER_NAMES[index]}</b>{entries.length ? `${entries.length.toLocaleString("zh-HK")}注中` : "未中"}</button>; })}</div></div>{autoSummary && <button className="primary-action" onClick={closeAutoSummary}>完成</button>}</div>
    </DialogContent></Dialog>
    <footer><p>只供機率模擬及娛樂，並非真實投注服務。攪珠結果互相獨立，過往結果不會提高下期勝算。</p><p>只限年滿 18 歲人士。請理性娛樂。</p><p className="sound-credit">攪珠音效：<a href="https://soundbible.com/2199-Marbles.html" target="_blank" rel="noreferrer">Marbles — Daniel Simion</a>（CC BY 3.0）</p></footer>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>播放與提示</DialogTitle><DialogDescription>設定只儲存於此瀏覽器。</DialogDescription></DialogHeader>
      <div className="settings-row"><span>注項顯示</span><Select value={density} onValueChange={value => { setDensity(value); savePlayback({ muted, speed, density: value }); }}><SelectTrigger aria-label="注項密度"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="comfortable">舒適</SelectItem><SelectItem value="dense">密集</SelectItem></SelectContent></Select></div>
      <p className="setting-hint">各獎級開關同時控制中獎彈窗及自動投注底部方塊。</p>
      {TIER_NAMES.map((name, index) => <label key={name} className="settings-row"><span>{name}<small>{TIER_RULES[index]}</small></span><Switch checked={alertTiers[index]} onCheckedChange={enabled => setTierAlert(index, enabled)} aria-label={`${name}中獎彈窗提示`}/></label>)}
    </DialogContent></Dialog>
    <Dialog open={resetOpen} onOpenChange={setResetOpen}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>重設本期戰績？</DialogTitle><DialogDescription>第 {draw.drawNo} 期嘅戰績會清除，歷來總計亦會扣除本期。其他期數及舊版戰績會保留。</DialogDescription></DialogHeader><button className="primary-action" onClick={() => { resetStats(); setResetOpen(false); }}>確認重設本期</button></DialogContent></Dialog>
    <Dialog open={winnerOpen} onOpenChange={setWinnerOpen}><DialogContent className="winner-dialog"><div className="trophy-wrap"><Trophy size={36} /></div><DialogHeader><DialogTitle>恭喜中獎！</DialogTitle><DialogDescription>{lastTriggeredTier >= 0 ? `${TIER_NAMES[lastTriggeredTier]} · ` : ""}{lastWin?.label}</DialogDescription></DialogHeader><div className="winner-amount">{money(lastWin?.prize ?? 0)}</div><div className="winner-breakdown">{lastWin?.wins.map((count, i) => count > 0 && <span key={i}>{TIER_NAMES[i]} × {count.toLocaleString("zh-HK")}</span>)}</div><button className="primary-action full" onClick={() => setWinnerOpen(false)}>繼續模擬</button></DialogContent></Dialog>
  </main>;
}
