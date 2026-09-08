export type Seed = [number, number, number, number];
export type HuntDraw = { numbers: number[]; extra: number; prizes: {tier:number; dividend:number|null}[] };
export const JACKPOT_ODDS = 13_983_816;
export function ticketAt(seed: Seed, entry: number): number[] {
  // Independently addressable pseudorandom streams let the UI revisit millions
  // of tickets without storing six numbers for every unsuccessful entry.
  const mix = (n: number) => { n = Math.imul(n ^ (n >>> 16),0x21f0aaad); n = Math.imul(n ^ (n >>> 15),0x735a2d97); return (n ^ (n >>> 15)) >>> 0; };
  const low = entry >>> 0, high = Math.floor(entry / 0x100000000);
  let a=mix(seed[0]^low), b=mix(seed[1]^high^low), c=mix(seed[2]^low^0x9e3779b9), d=mix(seed[3]^high^0x85ebca6b);
  if (!(a|b|c|d)) d=1;
  const random = () => {
    const product=Math.imul(b,5); const result=Math.imul((product<<7)|(product>>>25),9)>>>0;
    const t=b<<9; c^=a; d^=b; b^=c; a^=d; c^=t; d=(d<<11)|(d>>>21);
    return result;
  };
  const pick: number[]=[];
  const limit=Math.floor(0x100000000/49)*49;
  while (pick.length<6) { const r=random(); if(r>=limit) continue; const n=r%49+1; if(!pick.includes(n)) pick.push(n); }
  return pick.sort((x,y)=>x-y);
}
export function ticketTier(pick: number[], numbers: number[], extra: number) {
  let regular=0; for(const n of pick) if(numbers.includes(n)) regular++;
  const special=pick.includes(extra);
  return regular===6 ? 0 : regular===5 ? (special?1:2) : regular===4 ? (special?3:4) : regular===3 ? (special?5:6) : -1;
}
export function simulateChunk(seed: Seed, draw: HuntDraw, start: number, count: number) {
  const wins=[0,0,0,0,0,0,0]; const hits:number[][]=Array.from({length:7},()=>[]);
  let entries=0,prize=0,unpricedEntries=0;
  for(let i=0;i<count;i++) {
    const entry=start+i, tier=ticketTier(ticketAt(seed,entry),draw.numbers,draw.extra);
    entries++;
    if(tier<0) continue;
    wins[tier]++; hits[tier].push(entry);
    const dividend=draw.prizes.find(p=>p.tier===tier+1)?.dividend;
    if(dividend==null) unpricedEntries++; else prize+=dividend;
    if(tier===0) break;
  }
  return {entries,cost:entries*10,prize,unpricedEntries,wins,hits,won:wins[0]>0};
}
