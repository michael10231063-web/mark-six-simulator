"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Maximize2, RotateCcw, Square, Trophy, Wifi, WifiOff, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Wins = [number, number, number, number, number, number, number];
type Prize = { tier: number; dividend: number; winningUnit: number };
type Draw = { drawNo: string; drawDate: string; numbers: number[]; extra: number; prizes: Prize[]; updatedFromOfficial: boolean };
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
function classify(numbers: number[], draw: Draw) {
  const regular = numbers.filter((n) => draw.numbers.includes(n)).length; const extra = numbers.includes(draw.extra);
  if (regular === 6) return 0; if (regular === 5 && extra) return 1; if (regular === 5) return 2;
  if (regular === 4 && extra) return 3; if (regular === 4) return 4; if (regular === 3 && extra) return 5; if (regular === 3) return 6; return -1;
}
function prizeTotal(wins: Wins, draw: Draw, stake: number) {
  return wins.reduce((sum, count, index) => sum + count * (draw.prizes.find((p) => p.tier === index + 1)?.dividend ?? 0) * (stake / 10), 0);
}
function wait(ms: number) { return new Promise<void>((resolve) => window.setTimeout(resolve, ms)); }
function Ball({ number, extra = false, small = false, muted = false }: { number: number; extra?: boolean; small?: boolean; muted?: boolean }) {
  return <span className={`ball ball-${ballColor(number)} ${extra ? "ball-extra" : ""} ${small ? "ball-small" : ""} ${muted ? "ball-muted" : ""}`}>{number}</span>;
}
function usePersistentStats() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem("mark-six-sim-stats-v1"); if (saved) setStats(JSON.parse(saved)); } catch {}
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (loaded) { try { localStorage.setItem("mark-six-sim-stats-v1", JSON.stringify(stats)); } catch {} } }, [loaded, stats]);
  return [stats, setStats] as const;
}

export default function Home() {
  const [draw, setDraw] = useState<Draw>(FALLBACK_DRAW); const [loadingDraw, setLoadingDraw] = useState(true);
  const [quickCount, setQuickCount] = useState(1); const [stats, setStats] = usePersistentStats();
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
  const tierCursorRef = useRef<number[]>(Array(7).fill(0)); const focusTimerRef = useRef<number | null>(null);

  const loadLatest = useCallback(async () => {
    setLoadingDraw(true);
    try { const response = await fetch("/api/latest-result", { cache: "no-store" }); if (!response.ok) throw new Error(); setDraw(await response.json()); }
    catch { setDraw(FALLBACK_DRAW); } finally { setLoadingDraw(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(loadLatest, 0);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
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
  useEffect(() => () => {
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
  }, []);
  useEffect(() => {
    if (!autoRunning) return;
    const frame = window.requestAnimationFrame(() => {
      const grid = autoTicketGridRef.current;
      if (grid) grid.scrollTo({ top: grid.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoRunning, autoTickets.length, isDrawing]);
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

  function playSound(kind: "spin" | "settle") {
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = audioContextRef.current ?? new AudioCtor(); audioContextRef.current = context;
    void context.resume(); const now = context.currentTime + 0.01;
    if (kind === "spin") {
      const gain = context.createGain(); const filter = context.createBiquadFilter();
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.035, now + 0.08); gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.98);
      filter.type = "lowpass"; filter.frequency.setValueAtTime(850, now); filter.frequency.exponentialRampToValueAtTime(1900, now + 0.72); filter.connect(gain).connect(context.destination);
      [170, 238].forEach((frequency, index) => { const oscillator = context.createOscillator(); oscillator.type = index ? "triangle" : "sawtooth"; oscillator.frequency.setValueAtTime(frequency, now); oscillator.frequency.exponentialRampToValueAtTime(frequency * 3.1, now + 0.82); oscillator.connect(filter); oscillator.start(now + index * 0.025); oscillator.stop(now + 1); });
      return;
    }
    [784, 1175].forEach((frequency, index) => { const oscillator = context.createOscillator(); const gain = context.createGain(); const start = now + index * 0.055; oscillator.type = "sine"; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.055, start + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28); oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + 0.3); });
  }

  const addResult = useCallback((result: BetResult, allowPopup = true) => {
    setStats((old) => ({ entries: old.entries + result.entries, cost: old.cost + result.cost,
      prize: old.prize + result.prize, wins: old.wins.map((v, i) => v + result.wins[i]) as Wins }));
    setLastLabel(result.label); const hasWin = result.wins.some(Boolean);
    if (hasWin) {
      setLastWin(result);
      const triggeredTier = result.wins.findIndex((count, index) => count > 0 && alertTiers[index]);
      setLastTriggeredTier(triggeredTier);
      if (allowPopup && triggeredTier >= 0) setWinnerOpen(true);
    }
    return hasWin;
  }, [alertTiers, setStats]);

  const randomBet = useCallback((count: number, showPicks = true): BetResult => {
    const picks = Array.from({ length: count }, quickPick); const wins = [...EMPTY_WINS] as Wins;
    picks.forEach((pick) => { const tier = classify(pick, draw); if (tier >= 0) wins[tier] += 1; }); if (showPicks) setLastPicks(picks);
    return { entries: count, cost: count * 10, prize: prizeTotal(wins, draw, 10), wins, label: `${count.toLocaleString("zh-HK")} 注隨機號碼`, picks };
  }, [draw]);

  async function placeBet() {
    if (isDrawing || autoRunning) return;
    const result = randomBet(quickCount, false);
    if (result.picks) setLastPicks(result.picks);
    playSound("spin"); setIsDrawing(true);
    await wait(DRAW_CYCLE_MS);
    playSound("settle"); addResult(result);
    setIsDrawing(false);
  }
  async function runUntilWin() {
    if (isDrawing || autoRunning) return;
    let attempts = 0, entries = 0, cost = 0, prize = 0; const wins = [...EMPTY_WINS] as Wins; let latest: BetResult;
    do { latest = randomBet(quickCount, false); attempts += 1; entries += latest.entries; cost += latest.cost; prize += latest.prize; latest.wins.forEach((v, i) => wins[i] += v); }
    while (!latest.wins.some(Boolean) && attempts < 100_000);
    setLastPicks(latest.picks ?? []);
    playSound("spin"); setIsDrawing(true); await wait(DRAW_CYCLE_MS);
    playSound("settle"); addResult({ entries, cost, prize, wins, label: "連續投注至中獎" });
    setIsDrawing(false);
  }
  async function startAutoBet() {
    if (autoRunning || isDrawing) return;
    const requested = Math.max(1, Math.min(100_000, Math.floor(autoTotal) || 1));
    const perRound = Math.max(1, Math.min(100, Math.floor(quickCount) || 1));
    cancelAutoRef.current = false;
    tierCursorRef.current = Array(7).fill(0); setFocusedEntry(null);
    setAutoTotal(requested); setWinnerOpen(false); setAutoSummary(null); setAutoRunning(true); setAutoTickets([]);
    const emptyHits = Array.from({ length: 7 }, () => [] as number[]);
    setAutoHitEntries(emptyHits);
    setAutoProgress({ completed: 0, total: requested, cost: 0, prize: 0, wins: [...EMPTY_WINS] as Wins });
    playSound("spin");
    if (autoFullscreen && document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined);
    let completed = 0, cost = 0, prize = 0;
    const wins = [...EMPTY_WINS] as Wins; const hits = Array.from({ length: 7 }, () => [] as number[]);
    while (completed < requested && !cancelAutoRef.current) {
      const batch = Math.min(perRound, requested - completed); const result = randomBet(batch, false); const picks = result.picks ?? [];
      const roundStart = completed + 1;
      const roundTickets = picks.map((pick, index) => ({ entry: roundStart + index, numbers: pick, tier: classify(pick, draw), status: "drawing" as const }));
      if (completed > 0) playSound("spin"); setAutoTickets((old) => [...old, ...roundTickets]); setIsDrawing(true);
      await wait(DRAW_CYCLE_MS);
      playSound("settle");
      setAutoTickets((old) => old.map((ticket) => ticket.entry >= roundStart && ticket.entry < roundStart + batch ? { ...ticket, status: "settled" } : ticket));
      setIsDrawing(false);
      picks.forEach((pick, index) => { const tier = classify(pick, draw); if (tier >= 0 && alertTiers[tier]) hits[tier].push(completed + index + 1); });
      completed += batch; cost += result.cost; prize += result.prize; result.wins.forEach((value, index) => { wins[index] += value; });
      setAutoHitEntries(hits.map((row) => [...row]));
      setAutoProgress({ completed, total: requested, cost, prize, wins: [...wins] as Wins });
      setLastPicks(picks); addResult(result, false);
      await wait(260);
    }
    setIsDrawing(false); setAutoRunning(false);
    setAutoSummary({ requested, completed, total: requested, cost, prize, wins: [...wins] as Wins, hitEntries: hits.map((row) => [...row]), cancelled: cancelAutoRef.current });
  }
  function stopAutoBet() { cancelAutoRef.current = true; }
  async function closeAutoSummary() {
    setAutoSummary(null); setAutoTickets([]); setFocusedEntry(null); tierCursorRef.current = Array(7).fill(0);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }
  function jumpToTier(index: number, entries: number[]) {
    if (!entries.length) return;
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

  return <main className="app-shell">
    <header className="topbar"><div className="brand-mark"><span>6</span><i>+</i></div><div><p className="eyebrow">MARK SIX LAB</p><h1>六合彩模擬器</h1></div><button className="icon-button" onClick={loadLatest} aria-label="更新最新攪珠結果"><RotateCcw className={loadingDraw ? "spin" : ""} size={19} /></button></header>
    <div className={`frozen-draw ${showFrozenDraw && !autoRunning && !autoSummary ? "visible" : ""}`} aria-hidden={!showFrozenDraw}>
      <span>第 {draw.drawNo} 期</span><div className="frozen-balls">{draw.numbers.map((n) => <Ball key={n} number={n} small />)}<b>+</b><Ball number={draw.extra} extra small /></div>
    </div>
    <div className="content-grid">
      <section className="bet-card">
        <div ref={drawPanelRef} className="draw-panel"><div className="draw-meta"><div><span className="section-kicker">最近一期攪珠</span><strong>第 {draw.drawNo} 期</strong></div><div className={`source-pill ${draw.updatedFromOfficial ? "online" : "offline"}`}>{draw.updatedFromOfficial ? <Wifi size={13} /> : <WifiOff size={13} />}{draw.updatedFromOfficial ? "馬會即時資料" : "已儲存資料"}</div></div>
          <div className="draw-balls" aria-label={`攪珠結果 ${draw.numbers.join("、")}，特別號 ${draw.extra}`}>{draw.numbers.map((n) => <Ball key={n} number={n} />)}<span className="plus">+</span><Ball number={draw.extra} extra /></div><p className="draw-date">{draw.drawDate.replaceAll("-", "/")} · 特別號碼以金圈標示</p></div>
        <div className="ticket-panel">
          <div className="ticket-heading"><div><span className="section-kicker">隨機投注</span><strong>{lastLabel}</strong></div></div>
          <div className="mode-content random-only"><div className="counter-row"><div><span>每批注數</span><p>每注隨機產生 6 個號碼</p></div><div className="stepper"><button onClick={() => setQuickCount(Math.max(1, quickCount - 1))} aria-label="減少注數">−</button><strong>{quickCount}</strong><button onClick={() => setQuickCount(Math.min(100, quickCount + 1))} aria-label="增加注數">＋</button></div></div>
            <label className="auto-toggle"><span><b>自動投注</b><small>按每批注數自動完成</small></span><Switch checked={autoMode} onCheckedChange={setAutoMode} aria-label="開啟自動投注" /></label>
            {autoMode && <div className="auto-config"><label><span>總注數</span><input type="number" inputMode="numeric" min={1} max={100000} value={autoTotal} onChange={(event) => setAutoTotal(Math.max(1, Math.min(100000, Number(event.target.value) || 1)))} /></label><label className="fullscreen-option"><span><Maximize2 size={15} /> 全螢幕播放</span><Switch checked={autoFullscreen} onCheckedChange={setAutoFullscreen} aria-label="自動投注全螢幕" /></label></div>}
            <div className="last-picks">{lastPicks.length ? lastPicks.map((pick, i) => { const tier = classify(pick, draw); const drawing = isDrawing && !autoRunning; const winner = !drawing && tier >= 0; return <div className={`pick-row ${drawing ? "drawing" : winner ? "winning" : "losing"}`} key={`${pick.join("-")}-${i}`}><span className="pick-index">{i + 1}</span><div className="pick-balls">{pick.map((n) => <Ball key={n} number={n} small extra={winner && n === draw.extra} muted={winner && !draw.numbers.includes(n) && n !== draw.extra} />)}</div><em>{drawing ? "開彩中" : winner ? TIER_NAMES[tier] : "未中"}</em></div>; }) : <div className="empty-pick">按「投注一次」即時產生號碼</div>}</div>
          </div>
          <div className="action-dock"><div className="cost-preview"><span>{autoMode ? "自動投注總計" : "今次投注"}</span><strong>{(autoMode ? autoTotal : quickCount).toLocaleString("zh-HK")} 注 · {money((autoMode ? autoTotal : quickCount) * 10)}</strong></div><button className="secondary-action" disabled={isDrawing || autoRunning} onClick={autoMode ? placeBet : runUntilWin}>{autoMode ? "投注一批" : "連續至中獎"}</button><button className="primary-action" disabled={isDrawing || autoRunning} onClick={autoMode ? startAutoBet : placeBet}>{isDrawing ? "開彩中…" : autoMode ? "開始自動" : "投注一次"}</button></div>
        </div>
      </section>
      <aside className="stats-column">
        <section className="summary-card"><div className="card-title-row"><div><span className="section-kicker">模擬戰績</span><h2>今期累計</h2></div><button className="text-button danger" onClick={() => setStats(EMPTY_STATS)}>重設</button></div>
          <div className="money-grid compact"><div><span>總投注成本</span><strong>{money(stats.cost)}</strong></div><div><span>中獎獎金</span><strong className="gold">{money(stats.prize)}</strong></div><div><span>淨結果</span><strong className={stats.prize - stats.cost >= 0 ? "positive" : "negative"}>{money(stats.prize - stats.cost)}</strong></div></div>
          <div className="stat-strip compact"><span><b>{stats.entries.toLocaleString("zh-HK")}</b> 總注數</span><span><b>{stats.wins.reduce((a, b) => a + b, 0).toLocaleString("zh-HK")}</b> 中獎注數</span></div></section>
        <section className="prize-card"><div className="card-title-row"><div><span className="section-kicker">當期派彩</span><h2>各獎級結果</h2></div><span className="unit-note">每 $10 注項</span></div><div className="prize-list">
          {TIER_NAMES.map((name, index) => { const prize = draw.prizes.find((p) => p.tier === index + 1); return <div className={`prize-row ${stats.wins[index] ? "won" : ""}`} key={name}><div className="tier-badge">{index + 1}</div><div className="tier-name"><strong>{name}</strong><span>{TIER_RULES[index]}</span></div><div className="tier-official"><strong>{money(prize?.dividend ?? 0)}</strong><span>{(prize?.winningUnit ?? 0).toLocaleString("zh-HK")} 注中</span></div><div className="tier-yours"><strong>{stats.wins[index].toLocaleString("zh-HK")}</strong><span>你中</span></div><label className="tier-alert"><Switch size="sm" checked={alertTiers[index]} onCheckedChange={(enabled) => setTierAlert(index, enabled)} aria-label={`${name}中獎彈窗提示`} /><span>提示</span></label></div>; })}
        </div></section>
      </aside>
    </div>
    {(autoRunning || autoSummary) && <section className="auto-overlay" role="dialog" aria-modal="true" aria-label="自動投注">
      <header className="auto-header"><div><span>AUTO DRAW</span><strong>{autoSummary && <CheckCircle2 size={17} />}{autoRunning ? "自動投注進行中" : autoSummary?.cancelled ? "自動投注已停止" : "自動投注完成"}</strong></div><button onClick={autoRunning ? stopAutoBet : closeAutoSummary} aria-label={autoRunning ? "停止自動投注" : "關閉總結"}>{autoRunning ? <Square size={18} /> : <X size={21} />}</button></header>
      <div className="auto-draw-stage"><span>第 {draw.drawNo} 期攪珠結果</span><div className="auto-static-balls">{draw.numbers.map((n) => <Ball key={n} number={n} />)}<b>+</b><Ball number={draw.extra} extra /></div><small>{isDrawing ? "投注號碼開彩中…" : autoRunning ? "準備下一批投注" : "所有投注已完成，可捲動查看"}</small></div>
      <div className="auto-progress-card"><div className="progress-heading"><span>{autoSummary ? autoSummary.cancelled ? "已停止" : "已完成" : "進度"}</span><strong>{displayedAuto.completed.toLocaleString("zh-HK")} / {displayedAuto.total.toLocaleString("zh-HK")} 注</strong></div><div className="progress-track"><i style={{ width: `${Math.min(100, displayedAuto.completed / displayedAuto.total * 100)}%` }} /></div><div className={`auto-metrics no-round ${autoSummary ? "has-net" : ""}`}><span>成本 <b>{money(displayedAuto.cost)}</b></span><span>獎金 <b>{money(displayedAuto.prize)}</b></span>{autoSummary && <span>淨額 <b className={displayedAuto.prize - displayedAuto.cost >= 0 ? "positive" : "negative"}>{money(displayedAuto.prize - displayedAuto.cost)}</b></span>}</div></div>
      <div ref={autoTicketGridRef} className="auto-ticket-grid">{autoTickets.map((ticket) => { const winner = ticket.status === "settled" && ticket.tier >= 0; return <div data-entry={ticket.entry} className={`auto-pick-card ${ticket.status === "drawing" ? "drawing" : winner ? "winning" : "losing"} ${focusedEntry === ticket.entry ? "tier-focused" : ""}`} key={ticket.entry}><div className="ticket-meta"><span>#{ticket.entry}</span><em>{ticket.status === "drawing" ? "開彩中" : winner ? TIER_NAMES[ticket.tier] : "未中"}</em></div><div className="ticket-balls">{ticket.numbers.map((n) => <Ball key={n} number={n} small extra={winner && n === draw.extra} muted={winner && !draw.numbers.includes(n) && n !== draw.extra} />)}</div></div>; })}</div>
      <div className={`auto-footer-panel ${autoSummary ? "complete" : ""}`}><div className="auto-live-hits"><strong>{autoSummary ? `完成 ${autoSummary.completed.toLocaleString("zh-HK")} 注` : "已開啟提示獎級"}</strong><div>{alertTiers.map((enabled, index) => { if (!enabled) return null; const entries = autoSummary ? autoSummary.hitEntries[index] : autoHitEntries[index]; return <button type="button" className={`tier-jump ${entries.length ? "hit" : ""}`} disabled={!entries.length} onClick={() => jumpToTier(index, entries)} aria-label={`${TIER_NAMES[index]}，${entries.length ? `中 ${entries.length} 注，跳到下一張中獎票` : "未中"}`} key={TIER_NAMES[index]}><b>{TIER_NAMES[index]}</b>{entries.length ? `${entries.length.toLocaleString("zh-HK")} 注中` : "未中"}</button>; })}</div></div>{autoSummary && <button className="primary-action" onClick={closeAutoSummary}>完成</button>}</div>
    </section>}
    <footer><p>只供機率模擬及娛樂，並非真實投注服務。攪珠結果互相獨立，過往結果不會提高下期勝算。</p><p>只限年滿 18 歲人士。請理性娛樂。</p></footer>
    <Dialog open={winnerOpen} onOpenChange={setWinnerOpen}><DialogContent className="winner-dialog"><div className="trophy-wrap"><Trophy size={36} /></div><DialogHeader><DialogTitle>恭喜中獎！</DialogTitle><DialogDescription>{lastTriggeredTier >= 0 ? `${TIER_NAMES[lastTriggeredTier]} · ` : ""}{lastWin?.label}</DialogDescription></DialogHeader><div className="winner-amount">{money(lastWin?.prize ?? 0)}</div><div className="winner-breakdown">{lastWin?.wins.map((count, i) => count > 0 && <span key={i}>{TIER_NAMES[i]} × {count.toLocaleString("zh-HK")}</span>)}</div><button className="primary-action full" onClick={() => setWinnerOpen(false)}>繼續模擬</button></DialogContent></Dialog>
  </main>;
}
