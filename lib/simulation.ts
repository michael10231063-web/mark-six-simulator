export type Wins = [number, number, number, number, number, number, number];
export type Stats = { entries: number; cost: number; prize: number; wins: Wins };
export type Ledger = { version: 2; legacy: Stats; draws: Record<string, Stats> };
export const emptyStats = (): Stats => ({ entries: 0, cost: 0, prize: 0, wins: [0, 0, 0, 0, 0, 0, 0] });
export const emptyLedger = (): Ledger => ({ version: 2, legacy: emptyStats(), draws: {} });
export function validStats(value: unknown): value is Stats {
  if (!value || typeof value !== 'object') return false;
  const v = value as Stats;
  return [v.entries, v.cost, v.prize].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    && Array.isArray(v.wins) && v.wins.length === 7 && v.wins.every(n => Number.isSafeInteger(n) && n >= 0);
}
export function restoreLedger(saved: string | null, legacy: string | null): Ledger {
  if (saved !== null) {
    const value = JSON.parse(saved) as Ledger;
    if (value.version !== 2 || !validStats(value.legacy) || !value.draws || typeof value.draws !== 'object'
      || Array.isArray(value.draws) || !Object.values(value.draws).every(validStats)) throw new Error('Invalid ledger');
    return value;
  }
  const ledger = emptyLedger();
  if (legacy !== null) {
    const value: unknown = JSON.parse(legacy);
    if (!validStats(value)) throw new Error('Invalid legacy stats');
    ledger.legacy = value;
  }
  return ledger;
}
export function addStats(a: Stats, b: Stats): Stats {
  return { entries: a.entries + b.entries, cost: a.cost + b.cost, prize: a.prize + b.prize,
    wins: a.wins.map((n, i) => n + b.wins[i]) as Wins };
}
export function recordResult(ledger: Ledger, key: string, result: Stats): Ledger {
  return { ...ledger, draws: { ...ledger.draws, [key]: addStats(ledger.draws[key] ?? emptyStats(), result) } };
}
export function totalStats(ledger: Ledger): Stats { return Object.values(ledger.draws).reduce(addStats, ledger.legacy); }
export function validDraw(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const d = value as { drawNo: string; drawDate: string; numbers: number[]; extra: number; prizes: {tier: number; dividend: number; winningUnit: number}[] };
  return typeof d.drawNo === 'string' && d.drawNo.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(d.drawDate)
    && Array.isArray(d.numbers) && d.numbers.length === 6 && new Set([...d.numbers, d.extra]).size === 7
    && [...d.numbers, d.extra].every(n => Number.isInteger(n) && n >= 1 && n <= 49)
    && Array.isArray(d.prizes) && d.prizes.length === 7 && new Set(d.prizes.map(p => p.tier)).size === 7
    && d.prizes.every(p => Number.isInteger(p.tier) && p.tier >= 1 && p.tier <= 7
      && Number.isFinite(p.dividend) && p.dividend >= 0 && Number.isFinite(p.winningUnit) && p.winningUnit >= 0);
}
