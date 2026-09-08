import { simulateChunk, type Seed, type HuntDraw } from './jackpot-engine';

let seed:Seed,draw:HuntDraw;
let paused=false,done=false,started=false,entries=0,prize=0,unpricedEntries=0,lastSent=0;
const wins=[0,0,0,0,0,0,0]; let hits:number[][]=Array.from({length:7},()=>[]);
let timer:ReturnType<typeof setTimeout>;
function publish(status:string) {
  self.postMessage({status,entries,cost:entries*10,prize,unpricedEntries,wins:[...wins],hits});
  hits=Array.from({length:7},()=>[]); lastSent=performance.now();
}
function tick() {
  if(paused||done) return;
  const deadline=performance.now()+24;
  do {
    const chunk=simulateChunk(seed,draw,entries+1,1000);
    entries+=chunk.entries; prize+=chunk.prize; unpricedEntries+=chunk.unpricedEntries;
    chunk.wins.forEach((n,i)=>{wins[i]+=n; hits[i].push(...chunk.hits[i]);});
    if(chunk.won) {done=true;publish('won');return;}
    if(!Number.isSafeInteger(entries*10+10000)) {done=true;publish('limit');return;}
  } while(performance.now()<deadline);
  if(performance.now()-lastSent>=200) publish('running');
  timer=setTimeout(tick,0);
}
self.onmessage=event=>{
  const message=event.data;
  if(message.type==='start'&&!started) {started=true;seed=message.seed;draw=message.draw;publish('running');tick();}
  if(message.type==='pause'&&!done) {paused=true;clearTimeout(timer);publish('paused');}
  if(message.type==='resume'&&paused&&!done) {paused=false;publish('running');tick();}
  if(message.type==='stop'&&!done) {done=true;clearTimeout(timer);publish('stopped');}
};
