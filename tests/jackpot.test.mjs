import test from 'node:test';
import assert from 'node:assert/strict';
import {ticketAt,ticketTier,simulateChunk,JACKPOT_ODDS} from '../lib/jackpot-engine.ts';
const seed=[123456,789012,345678,901234];
const payouts=[10000000,200000,19200,9600,640,320,40].map((dividend,i)=>({tier:i+1,dividend}));
test('tickets are repeatable by entry and always six distinct numbers in range',()=>{
 for(let i=1;i<=1000;i++) {
  const pick=ticketAt(seed,i);
  assert.equal(new Set(pick).size,6);
  assert.ok(pick.every(n=>n>=1&&n<=49));
  assert.deepEqual(ticketAt(seed,i),pick);
 }
 assert.notDeepEqual(ticketAt(seed,1),ticketAt(seed,2));
 assert.notDeepEqual(ticketAt(seed,1),ticketAt(seed,2**32+1));
 assert.equal(JACKPOT_ODDS,49*48*47*46*45*44/(6*5*4*3*2));
});
test('the first exact jackpot stops a chunk immediately without later bets',()=>{
 const numbers=ticketAt(seed,13),extra=Array.from({length:49},(_,i)=>i+1).find(n=>!numbers.includes(n));
 const result=simulateChunk(seed,{numbers,extra,prizes:payouts},1,1000);
 assert.equal(result.entries,13);assert.equal(result.cost,130);assert.equal(result.wins[0],1);
 assert.deepEqual(result.hits[0],[13]);assert.equal(result.won,true);
});
test('small chunks and a single chunk count identical entries, prizes and hits',()=>{
 const draw={numbers:ticketAt(seed,2501),extra:49,prizes:payouts};
 const whole=simulateChunk(seed,draw,1,2000),a=simulateChunk(seed,draw,1,1000),b=simulateChunk(seed,draw,1001,1000);
 assert.equal(whole.entries,a.entries+b.entries);assert.equal(whole.prize,a.prize+b.prize);
 assert.deepEqual(whole.wins,a.wins.map((n,i)=>n+b.wins[i]));
 assert.deepEqual(whole.hits,a.hits.map((entries,i)=>[...entries,...b.hits[i]]));
});
test('a jackpot without a published dividend is still a win with unpriced accounting',()=>{
 const numbers=ticketAt(seed,1), draw={numbers,extra:49,prizes:payouts.map(p=>({...p,dividend:p.tier===1?null:p.dividend}))};
 const result=simulateChunk(seed,draw,1,100);
 assert.equal(result.won,true);assert.equal(result.entries,1);assert.equal(result.unpricedEntries,1);assert.equal(result.prize,0);
});
test('matching five main numbers and the special number is not a jackpot',()=>{
 assert.equal(ticketTier([1,2,3,4,5,7],[1,2,3,4,5,6],7),1);
 assert.equal(ticketTier([1,2,3,4,5,6],[1,2,3,4,5,6],7),0);
});
