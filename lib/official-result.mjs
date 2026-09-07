export const query = `fragment lotteryDrawsFragment on LotteryDraw { id year no drawDate status lotteryPool { lotteryPrizes { type winningUnit dividend } } drawResult { drawnNo xDrawnNo } } query marksixResult($lastNDraw: Int) { lotteryDraws(lastNDraw: $lastNDraw) { ...lotteryDrawsFragment } }`;

export function normalizeOfficialResult(json, now = new Date().toISOString()) {
  if (json.errors?.length) throw new Error('Official data query failed: ' + json.errors.map(e => e.message).join('; ').slice(0,300));
  const latest = (json.data?.lotteryDraws ?? [])
    .filter(d => d?.drawResult?.drawnNo?.length === 6 && d?.drawResult?.xDrawnNo)
    .sort((a, b) => String(b.drawDate).localeCompare(String(a.drawDate)))[0];
  if (!latest) throw new Error('No completed draw');
  const numbers = latest.drawResult.drawnNo.map(Number).sort((a,b) => a-b);
  const extra = Number(latest.drawResult.xDrawnNo);
  const prizes = (latest.lotteryPool?.lotteryPrizes ?? []).map(p => ({ tier: Number(p.type), dividend: Number(p.dividend), winningUnit: Number(p.winningUnit) }));
  if (new Set([...numbers, extra]).size !== 7 || ![...numbers, extra].every(n => Number.isInteger(n) && n >= 1 && n <= 49)
    || prizes.length !== 7 || new Set(prizes.map(p => p.tier)).size !== 7
    || !prizes.every(p => Number.isInteger(p.tier) && p.tier >= 1 && p.tier <= 7 && Number.isFinite(p.dividend) && p.dividend >= 0 && Number.isFinite(p.winningUnit) && p.winningUnit >= 0)) throw new Error('Incomplete draw or dividends');
  const drawDate = String(latest.drawDate).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) throw new Error('Invalid date');
  return { drawNo: latest.id || `${String(latest.year).slice(-2)}/${String(latest.no).padStart(3,'0')}`, drawDate, numbers, extra, prizes, updatedFromOfficial: true, fetchedAt: now, lastAttemptAt: now, updateError: false };
}
export async function fetchOfficialResult() {
  const response = await fetch('https://info.cld.hkjc.com/graphql/base/', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationName: 'marksixResult', variables: { lastNDraw: 5 }, query }),
    cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`HKJC ${response.status}`);
  return normalizeOfficialResult(await response.json());
}
