import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaHistory, mergeDraws, validHistoryDraw, drawKey } from '../lib/draw-history.mjs';
import { emptyLedger, recordResult, totalStats, restoreWins } from '../lib/simulation.ts';
const row = {drawNumber:'26/096',drawDate:'2026-09-05',drawResult:'9,18,26,30,33,45,28',firstPrize:'63376610',secondPrize:'613630',thirdPrize:'37400',firstWinningUnit:'3.5',secondWinningUnit:'20.0',thirdWinningUnit:'875.0'};
test('media results retain unknown counts and absent payouts instead of inventing zero', () => {
 const [draw] = normalizeMediaHistory([{...row,firstPrize:'',firstWinningUnit:''}]);
 assert.equal(draw.prizes[0].dividend,null);
 assert.equal(draw.prizes[0].winningUnit,null);
 assert.equal(draw.prizes[3].winningUnit,null);
 assert.equal(draw.prizes[3].dividend,9600);
 assert.equal(draw.standardLowerPrizes,true);
 assert.equal(validHistoryDraw(draw),true);
});
test('malformed media data cannot become an updated result', () => {
 assert.throws(()=>normalizeMediaHistory([{...row,drawResult:'9,18,26,30,33,45,9'}]));
 assert.throws(()=>normalizeMediaHistory([{...row,firstPrize:'pending'}]));
 assert.throws(()=>normalizeMediaHistory([]));
});
test('history merging preserves newer draws and verified detail', () => {
 const [latest] = normalizeMediaHistory([row]);
 const official = {...latest,updatedFromOfficial:true,prizes:latest.prizes.map(p=>({...p,winningUnit:2}))};
 const older = {...latest,drawNo:'26/095',drawDate:'2026-08-29'};
 const merged = mergeDraws([official],[older,latest]);
 assert.equal(merged.length,2);
 assert.equal(merged[0].drawNo,'26/096');
 assert.equal(merged[0].prizes[6].winningUnit,2);
 assert.equal(drawKey(merged[1]),'2026-08-29:26/095');
});
test('unpriced wins survive accounting and collection without a false zero payout', () => {
 const result={entries:1,cost:10,prize:0,unpricedEntries:1,wins:[1,0,0,0,0,0,0]};
 const ledger=recordResult(emptyLedger(),'2026-09-05:26/096',result);
 assert.equal(totalStats(ledger).unpricedEntries,1);
 assert.equal(totalStats(ledger).prize,0);
 const win={id:'unknown',savedAt:'2026-09-07T00:00:00Z',drawNo:'26/096',drawDate:'2026-09-05',numbers:[9,18,26,30,33,45],extra:28,pick:[9,18,26,30,33,45],tier:0,prize:null};
 assert.equal(restoreWins(JSON.stringify([win]))[0].prize,null);
});
