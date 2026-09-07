import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, emptyStats, restoreLedger, recordResult, totalStats, validDraw } from '../lib/simulation.ts';
import { normalizeOfficialResult } from '../lib/official-result.mjs';
const result = { entries: 10, cost: 100, prize: 40, wins: [0,0,0,0,0,0,1] };
test('old unscoped statistics migrate once into lifetime only', () => {
 const migrated = restoreLedger(null, JSON.stringify(result));
 assert.deepEqual(migrated.draws, {});
 assert.deepEqual(totalStats(migrated), result);
 const restored = restoreLedger(JSON.stringify(migrated), JSON.stringify(result));
 assert.deepEqual(totalStats(restored), result);
});
test('draws are isolated and lifetime combines results without mutation', () => {
 const original = emptyLedger();
 const first = recordResult(original,'2026-08-29:26/095',result);
 const second = recordResult(first,'2026-09-01:26/096',result);
 assert.deepEqual(first.draws['2026-08-29:26/095'],result);
 assert.equal(second.draws['2026-09-01:26/096'].cost,100);
 assert.equal(totalStats(second).cost,200);
 assert.equal(totalStats(second).wins[6],2);
 assert.deepEqual(original,emptyLedger());
 const reset = {...second, draws:{...second.draws,'2026-09-01:26/096':emptyStats()}};
 assert.equal(totalStats(reset).cost,100);
});
test('damaged persisted data is rejected instead of silently overwritten', () => {
 assert.throws(() => restoreLedger('{broken',JSON.stringify(result)));
 assert.throws(() => restoreLedger(null,JSON.stringify({...result,wins:[1]})));
});
const api = {data:{lotteryDraws:[{id:'26/095',drawDate:'2026-08-29T00:00:00',drawResult:{drawnNo:['4','7','8','11','26','30'],xDrawnNo:'42'},lotteryPool:{lotteryPrizes:Array.from({length:7},(_,i)=>({type:String(i+1),dividend:'40',winningUnit:'1.5'}))}}]}};
test('complete official results retain fractional winning units and fetch time', () => {
 const draw = normalizeOfficialResult(api,'2026-09-07T12:00:00.000Z');
 assert.equal(validDraw(draw),true);
 assert.equal(draw.prizes[0].winningUnit,1.5);
 assert.equal(draw.fetchedAt,'2026-09-07T12:00:00.000Z');
 assert.equal(validDraw({...draw,extra:4}),false);
 assert.equal(validDraw({...draw,prizes:[]}),false);
});
test('incomplete dividends and duplicate balls do not become successful snapshots', () => {
 const bad = structuredClone(api); bad.data.lotteryDraws[0].lotteryPool.lotteryPrizes.pop();
 assert.throws(()=>normalizeOfficialResult(bad));
 const duplicate = structuredClone(api); duplicate.data.lotteryDraws[0].drawResult.xDrawnNo='4';
 assert.throws(()=>normalizeOfficialResult(duplicate));
});

test('win collection keeps the original draw and dividend across reloads', async () => {
 const { restoreWins } = await import('../lib/simulation.ts');
 const win = { id:'test-win', savedAt:'2026-09-07T12:00:00.000Z', drawNo:'26/095', drawDate:'2026-08-29', numbers:[4,7,8,11,26,30], extra:42, pick:[4,7,8,20,21,22], tier:6, prize:40 };
 assert.deepEqual(restoreWins(JSON.stringify([win])),[win]);
 assert.deepEqual(restoreWins(null),[]);
 assert.throws(()=>restoreWins(JSON.stringify([{...win,pick:[4,4,8,20,21,22]}])));
});
