import { fetchOfficialResult } from './official-result.mjs';

export const MEDIA_URL = 'https://win.on.cc/marksix/markSixRealTime.js';
export const drawKey = d => `${d.drawDate}:${d.drawNo}`;
export function validHistoryDraw(d) {
  return !!d && /^\d{2}\/\d{3}$/.test(d.drawNo) && /^\d{4}-\d{2}-\d{2}$/.test(d.drawDate)
    && Number.isFinite(Date.parse(d.drawDate))
    && Array.isArray(d.numbers) && d.numbers.length === 6 && new Set([...d.numbers,d.extra]).size === 7
    && [...d.numbers,d.extra].every(n => Number.isInteger(n) && n >= 1 && n <= 49)
    && Array.isArray(d.prizes) && d.prizes.length === 7 && new Set(d.prizes.map(p=>p?.tier)).size === 7
    && d.prizes.every(p => p && Number.isInteger(p.tier) && p.tier >= 1 && p.tier <= 7
      && (p.dividend === null || (Number.isFinite(p.dividend) && p.dividend >= 0))
      && (p.winningUnit === null || (Number.isFinite(p.winningUnit) && p.winningUnit >= 0)));
}
export function mergeDraws(...groups) {
  const map = new Map();
  for (const group of groups) for (const draw of group) {
    if (!validHistoryDraw(draw)) continue;
    const old = map.get(drawKey(draw));
    // A media feed without lower-tier counts must not erase verified official detail.
    if (!old?.updatedFromOfficial || draw.updatedFromOfficial) map.set(drawKey(draw), draw);
  }
  return [...map.values()].sort((a,b)=>drawKey(b).localeCompare(drawKey(a)));
}
function nullableNumber(value) {
  if (value === '' || value === '-' || value == null) return null;
  if (!/^\d+(\.\d+)?$/.test(String(value))) throw new Error('Invalid dividend');
  return Number(value);
}
export function normalizeMediaHistory(rows, now = new Date().toISOString()) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Empty media history');
  const draws = rows.map(row => {
    const balls = String(row.drawResult).split(',').map(Number);
    const prizes = ['first','second','third'].map((name,i)=>({tier:i+1, dividend:nullableNumber(row[`${name}Prize`]), winningUnit:nullableNumber(row[`${name}WinningUnit`])}));
    // The media feed supplies top-three payouts only. Lower tiers use standard
    // simulation payouts, explicitly labelled in the UI; their counts are unknown.
    [9600,640,320,40].forEach((dividend,i)=>prizes.push({tier:i+4,dividend,winningUnit:null}));
    const draw = {drawNo:row.drawNumber,drawDate:row.drawDate,numbers:balls.slice(0,6).sort((a,b)=>a-b),extra:balls[6],prizes,
      updatedFromOfficial:false,source:'oncc',sourceUrl:'https://win.on.cc/marksix/',standardLowerPrizes:true,fetchedAt:now};
    if (balls.length !== 7 || !validHistoryDraw(draw)) throw new Error('Invalid media draw');
    return draw;
  });
  return mergeDraws(draws);
}
export async function fetchDrawHistory() {
  const now = new Date().toISOString();
  const results = await Promise.allSettled([
    fetchOfficialResult(),
    fetch(MEDIA_URL,{cache:'no-store',signal:AbortSignal.timeout(12000)}).then(async response=>{
      if (!response.ok) throw new Error(`Media ${response.status}`);
      return normalizeMediaHistory(await response.json(), now);
    }),
  ]);
  const [official,media] = results;
  const draws = mergeDraws(media.status === 'fulfilled' ? media.value : [], official.status === 'fulfilled' ? [official.value] : []);
  if (!draws.length) throw new Error(results.map(r=>r.status === 'rejected' ? String(r.reason) : '').join('; '));
  return {version:1,draws,checkedAt:now,updateError:false,officialUnavailable:official.status === 'rejected'};
}
