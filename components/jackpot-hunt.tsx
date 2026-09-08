"use client";

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pause, Play, Square, Trophy, X, Volume2, VolumeX } from 'lucide-react';
import { Dialog, DialogTitle } from '@/components/ui/dialog';
import { AutoBetDialogContent } from '@/components/auto-bet-dialog';
import { Ball } from '@/components/lottery-ball';
import { ticketAt, ticketTier, JACKPOT_ODDS, type Seed, type HuntDraw } from '@/lib/jackpot-engine';
import type { Stats, SavedWin, Wins } from '@/lib/simulation';

type Draw = HuntDraw & {drawNo:string;drawDate:string};
type Progress = Stats & {status:string;hits:number[][]};
type Props = {draw:Draw;muted:boolean;onMute:()=>void;onClose:()=>void;onAccount:(stats:Stats)=>void;onWin:(win:SavedWin)=>void;onSound:(kind:'spin'|'coin',duration?:number)=>void};
const TIERS=['頭獎','二獎','三獎','四獎','五獎','六獎','七獎'];
const PAGE_SIZE=40;
const empty=():Progress=>({status:'starting',entries:0,cost:0,prize:0,unpricedEntries:0,wins:[0,0,0,0,0,0,0],hits:Array.from({length:7},()=>[])});
const money=(n:number|null)=>n===null?'未有派彩':new Intl.NumberFormat('zh-HK',{style:'currency',currency:'HKD',maximumFractionDigits:0}).format(n);
const number=(n:number)=>n.toLocaleString('zh-HK');

export function JackpotHunt(props:Props) {
  const [progress,setProgress]=useState<Progress>(empty);
  const [status,setStatus]=useState('starting'); const [error,setError]=useState('');
  const [rate,setRate]=useState(0); const [seed,setSeed]=useState<Seed|null>(null);
  const [following,setFollowing]=useState(true); const [page,setPage]=useState(0); const [entryInput,setEntryInput]=useState('');
  const [focused,setFocused]=useState<number|null>(null);
  const worker=useRef<Worker|null>(null); const callbacks=useRef(props); callbacks.current=props;
  const allHits=useRef<number[][]>(Array.from({length:7},()=>[])); const cursors=useRef([0,0,0,0,0,0,0]);
  const previous=useRef<Progress>(empty()); const lastUpdate=useRef(0); const finished=useRef(false);
  const list=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const entropy=crypto.getRandomValues(new Uint32Array(4));
    const runSeed=Array.from(entropy) as Seed; setSeed(runSeed);
    let revealTimer:ReturnType<typeof setTimeout>|undefined;
    let alive=true;
    previous.current=empty(); allHits.current=Array.from({length:7},()=>[]); finished.current=false;
    try {
      const task=new Worker(new URL('../lib/jackpot.worker.ts',import.meta.url),{type:'module'}); worker.current=task;
      task.onmessage=event=>{
        if(!alive) return;
        const next=event.data as Progress, old=previous.current;
        if(next.entries<old.entries) return;
        const elapsed=performance.now()-lastUpdate.current;
        if(next.status==='running'&&old.status==='running'&&elapsed>0) setRate(Math.round((next.entries-old.entries)*1000/elapsed));
        lastUpdate.current=performance.now();
        next.hits.forEach((entries,i)=>{ for(const entry of entries) allHits.current[i].push(entry); });
        if(next.entries>old.entries) callbacks.current.onAccount({entries:next.entries-old.entries,cost:next.cost-old.cost,prize:next.prize-old.prize,
          unpricedEntries:(next.unpricedEntries??0)-(old.unpricedEntries??0),wins:next.wins.map((n,i)=>n-old.wins[i]) as Wins});
        previous.current=next; setProgress(next);
        if(next.status==='won'&&!finished.current) {
          finished.current=true; task.terminate(); setStatus('revealing');setFollowing(true);setFocused(next.entries);
          callbacks.current.onSound('spin',1800);
          revealTimer=setTimeout(()=>{
            if(!alive) return;
            setStatus('won');callbacks.current.onSound('coin');
            const draw=callbacks.current.draw;
            callbacks.current.onWin({id:`jackpot-${runSeed.join('-')}-${next.entries}`,savedAt:new Date().toISOString(),drawNo:draw.drawNo,drawDate:draw.drawDate,
              numbers:[...draw.numbers],extra:draw.extra,pick:ticketAt(runSeed,next.entries),tier:0,prize:draw.prizes.find(p=>p.tier===1)?.dividend??null});
          },1800);
        } else if(!finished.current) {
          setStatus(next.status);
          if(next.status==='limit') setError('已達可準確計帳嘅數值上限，模擬已停止。');
        }
      };
      task.onerror=()=>{if(alive){task.terminate();setStatus('error');setError('模擬中斷，已確認嘅戰績已保留。請關閉後再試。');}};
      task.postMessage({type:'start',seed:runSeed,draw:props.draw});
    } catch {setStatus('error');setError('此瀏覽器未能啟動高速模擬，請更新瀏覽器後再試。');}
    return ()=>{alive=false;worker.current?.terminate();if(revealTimer)clearTimeout(revealTimer);};
  },[]);

  const running=['starting','running','pausing','paused','stopping','revealing'].includes(status);
  const lastPage=Math.max(0,Math.floor((progress.entries-1)/PAGE_SIZE));
  const visiblePage=following?lastPage:Math.min(page,lastPage);
  const start=visiblePage*PAGE_SIZE+1, end=Math.min(progress.entries,start+PAGE_SIZE-1);
  const tickets=seed?Array.from({length:Math.max(0,end-start+1)},(_,i)=>{const entry=start+i,pick=ticketAt(seed,entry);return{entry,pick,tier:ticketTier(pick,props.draw.numbers,props.draw.extra)};}):[];
  function goTo(entry:number) {
    const target=Math.max(1,Math.min(progress.entries,Math.trunc(entry)));
    if(!Number.isFinite(target)||!progress.entries)return;
    setFollowing(false);setPage(Math.floor((target-1)/PAGE_SIZE));setFocused(target);
  }
  useEffect(()=>{
    if(!focused) {list.current?.scrollTo({top:0});return;}
    const align=()=>{
      const target=list.current?.querySelector<HTMLElement>(`[data-entry="${focused}"]`);
      if(target&&list.current) list.current.scrollTo({top:target.offsetTop-list.current.clientHeight/2+target.clientHeight/2});
    };
    align();
    const observer=new ResizeObserver(align);
    if(list.current)observer.observe(list.current);
    return ()=>observer.disconnect();
  },[visiblePage,focused]);
  async function close() {
    if(running)return;
    if(document.fullscreenElement) await document.exitFullscreen().catch(()=>undefined);
    props.onClose();
  }
  function stop() {setStatus('stopping');worker.current?.postMessage({type:'stop'});}
  const missing=props.draw.prizes.some(p=>p.dividend===null);
  return <Dialog open onOpenChange={open=>{if(!open&&!running)void close();}}><AutoBetDialogContent className={`auto-overlay hunt-overlay ${status==='won'?'hunt-won':''}`} style={{'--draw-duration':'1800ms'} as CSSProperties} aria-describedby={undefined} onEscapeKeyDown={e=>{if(running)e.preventDefault();}}>
    <header className="hunt-header"><div><span className="section-kicker">JACKPOT CHASE</span><DialogTitle>{status==='won'?'終於中頭獎！':'自動投注直到中頭獎'}</DialogTitle></div><button className="control-button" disabled={['starting','stopping','revealing'].includes(status)} onClick={running?stop:close} aria-label={running?'停止追頭獎':'關閉追頭獎總結'}>{running?<Square size={18}/>:<X size={20}/>}</button></header>
    <section className="hunt-dashboard">
      <div className="hunt-target"><span>第 {props.draw.drawNo} 期 · 六個正選全中即停</span><div>{props.draw.numbers.map(n=><Ball key={n} number={n} small/>)}<b>+</b><Ball number={props.draw.extra} small extra/></div></div>
      <div className="hunt-counter"><span>{status==='won'?'首次頭獎出現於':status==='revealing'?'頭獎注項揭曉中…':status==='paused'?'已暫停':status==='stopped'?'已停止':status==='stopping'?'正在停止…':status==='error'?'模擬中斷':'已模擬注數'}</span><strong>{number(progress.entries)}<small> 注</small></strong><span>{status==='running'?`約 ${number(rate)} 注／秒 · 每注獨立隨機`:status==='won'?`頭獎派彩 ${money(props.draw.prizes.find(p=>p.tier===1)?.dividend??null)}`:'單注頭獎機率 1 / '+number(JACKPOT_ODDS)}</span></div>
      <div className="hunt-metrics"><div><span>模擬成本</span><b>{money(progress.cost)}</b></div><div><span>{missing?'已知獎金':'總獎金'}</span><b>{money(progress.prize)}</b></div><div><span>{missing?'已知淨額':'淨額'}</span><b className={progress.prize-progress.cost>=0?'positive':'negative'}>{money(progress.prize-progress.cost)}</b></div></div>
      {status==='revealing'&&<div className="hunt-reveal drawing"><Trophy size={24}/><div>{props.draw.numbers.map(n=><Ball key={n} number={n} small/>)}</div></div>}
      {!!progress.unpricedEntries&&<p className="history-note">{number(progress.unpricedEntries)} 注中獎未有派彩，未計入獎金及淨額。</p>}
      {error&&<p className="update-notice" role="alert">{error}</p>}
      <div className="hunt-controls">{running&&<button className="control-button" disabled={!['running','paused'].includes(status)} onClick={()=>{const resume=status==='paused';setStatus(resume?'starting':'pausing');worker.current?.postMessage({type:resume?'resume':'pause'});}} aria-label={status==='paused'?'繼續追頭獎':'暫停追頭獎'}>{status==='paused'?<Play size={16}/>:<Pause size={16}/>}<span>{status==='paused'?'繼續':'暫停'}</span></button>}<button className="control-button" onClick={props.onMute} aria-label={props.muted?'開啟音效':'靜音'}>{props.muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><button className="control-button" onClick={()=>{setFollowing(!following);setPage(visiblePage);setFocused(null);}}>{following?'跟隨最新':'返回最新'}</button></div>
    </section>
    <div className="hunt-ticket-toolbar"><span>{progress.entries?`注項 #${number(start)}–${number(end)}`:'正在產生注項…'}</span><div><button disabled={!visiblePage} onClick={()=>{setFollowing(false);setPage(visiblePage-1);setFocused(null);}} aria-label="上一頁注項">‹</button><form onSubmit={e=>{e.preventDefault();goTo(Number(entryInput));}}><input aria-label="跳到第幾注" inputMode="numeric" type="number" min="1" max={progress.entries||1} placeholder="第幾注" value={entryInput} onChange={e=>setEntryInput(e.target.value)}/><button type="submit" disabled={!progress.entries}>前往</button></form><button disabled={visiblePage>=lastPage} onClick={()=>{setFollowing(false);setPage(visiblePage+1);setFocused(null);}} aria-label="下一頁注項">›</button></div></div>
    <div ref={list} className="auto-ticket-grid hunt-tickets" onWheel={()=>{setFollowing(false);setPage(visiblePage);}} onTouchStart={()=>{setFollowing(false);setPage(visiblePage);}}>{tickets.map(ticket=><div key={ticket.entry} data-entry={ticket.entry} className={`auto-pick-card ${ticket.tier>=0?'winning':'losing'} ${focused===ticket.entry?'tier-focused':''} ${status==='revealing'&&ticket.tier===0?'drawing':''}`}><div className="ticket-meta"><span>#{number(ticket.entry)}</span><em>{ticket.tier>=0?TIERS[ticket.tier]:'未中'}</em></div><div className="ticket-balls">{ticket.pick.map(n=><Ball key={n} number={n} small extra={ticket.tier>=0&&n===props.draw.extra} muted={ticket.tier>=0&&!props.draw.numbers.includes(n)&&n!==props.draw.extra}/>)}</div></div>)}</div>
    <footer className="hunt-footer"><div className="auto-live-hits"><div>{TIERS.map((tier,i)=><button className={`tier-jump ${progress.wins[i]?'hit':''}`} key={tier} disabled={!progress.wins[i]} onClick={()=>{const entries=allHits.current[i];goTo(entries[cursors.current[i]++%entries.length]);}} aria-label={`${tier}，中 ${progress.wins[i]} 注，跳到中獎票`}><b>{tier}</b><span>{number(progress.wins[i])}</span></button>)}</div></div><p>全部注項可分頁翻查；只將頭獎存入收藏冊。關閉總結後保留戰績及頭獎收藏。</p>{!running&&<button className="primary-action" onClick={close}>完成</button>}</footer>
  </AutoBetDialogContent></Dialog>;
}
