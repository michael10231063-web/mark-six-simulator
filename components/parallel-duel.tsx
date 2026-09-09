"use client";
import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Pause,Play,FastForward,X,Shuffle,Volume2,VolumeX,GitFork} from 'lucide-react';
import {Dialog,DialogTitle} from '@/components/ui/dialog';
import {AutoBetDialogContent} from '@/components/auto-bet-dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Ball} from '@/components/lottery-ball';
import {buildDuel,duelHistory,duelTotals,duelVerdict,ticketAt,type Seed,type DuelDraw,type DuelRound} from '@/lib/jackpot-engine';
const TIERS=['頭獎','二獎','三獎','四獎','五獎','六獎','七獎'];
const cash=(n:number)=>new Intl.NumberFormat('zh-HK',{style:'currency',currency:'HKD',maximumFractionDigits:0}).format(n);
const entropy=()=>Array.from(crypto.getRandomValues(new Uint32Array(4))) as Seed;
type Props={draws:DuelDraw[];end:DuelDraw;muted:boolean;onMute:()=>void;onClose:()=>void;onSound:(kind:'spin'|'coin'|'settle',duration?:number)=>void};
export function ParallelDuel(props:Props){
  const [seed,setSeed]=useState<Seed|null>(null);const [length,setLength]=useState(()=>String(Math.min(50,duelHistory(props.draws,props.end,props.draws.length).length)));
  const [rounds,setRounds]=useState<DuelRound[]>([]);const [completed,setCompleted]=useState(0);
  const [running,setRunning]=useState(false);const [phase,setPhase]=useState<'reveal'|'result'>('reveal');const [speed,setSpeed]=useState('1');const [review,setReview]=useState<number|null>(null);
  const body=useRef<HTMLDivElement>(null);
  const sound=useRef(props.onSound);sound.current=props.onSound;
  useEffect(()=>{setSeed(entropy());},[]);
  const available=useMemo(()=>duelHistory(props.draws,props.end,props.draws.length),[props.draws,props.end]);
  const selected=useMemo(()=>available.slice(-Number(length)),[available,length]);
  const fixed=seed?ticketAt(seed,1):[];
  const started=rounds.length>0,finished=started&&completed===rounds.length;
  const duration=speed==='1'?1100:350;
  useEffect(()=>{
    if(!running||completed>=rounds.length)return;
    if(phase==='result'){const timer=setTimeout(()=>setPhase('reveal'),speed==='1'?650:200);return ()=>clearTimeout(timer);}
    sound.current('spin',duration);
    const timer=setTimeout(()=>{
      const row=rounds[completed];sound.current(row.fixed.tier>=0||row.random.tier>=0?'coin':'settle');
      setCompleted(completed+1);setPhase('result');if(completed+1===rounds.length)setRunning(false);
    },duration);
    return ()=>clearTimeout(timer);
  },[running,completed,rounds,duration,phase,speed]);
  const shown=review??Math.max(0,completed-1);
  const active=running&&phase==='reveal'?rounds[completed]:completed?rounds[shown]:undefined;
  const revealing=running&&phase==='reveal'&&review===null;
  const settled=rounds.slice(0,completed);
  const totals={fixed:duelTotals(settled,'fixed'),random:duelTotals(settled,'random')};
  const verdict=duelVerdict(settled);
  const resultText=verdict==='unpriced'?'部分派彩未公布，勝負暫未能確定':verdict==='tie'?'兩個宇宙打成平手':verdict==='fixed'?'宇宙 A・固定號碼勝出':'宇宙 B・每期換號勝出';
  function start(){if(!seed||!selected.length)return;setRounds(buildDuel(selected,seed));setCompleted(0);setReview(null);setPhase('reveal');setRunning(true);}
  function reset(){setRunning(false);setRounds([]);setCompleted(0);setReview(null);setSeed(entropy());body.current?.scrollTo({top:0});}
  return <Dialog open onOpenChange={open=>{if(!open)props.onClose();}}><AutoBetDialogContent className="auto-overlay duel-overlay" aria-describedby={started?undefined:"duel-description"} style={{'--draw-duration':`${duration}ms`} as CSSProperties}>
    <header className="duel-header"><div><span className="section-kicker">PARALLEL UNIVERSES</span><DialogTitle>平行宇宙對決</DialogTitle></div><button className="control-button" onClick={props.onClose} aria-label="結束並關閉對決"><X size={20}/></button></header>
    <div ref={body} className="duel-body">
      {!started?<section className="duel-setup">
        <div className="duel-intro"><GitFork size={30}/><h3>同一個起點，兩條號碼旅程。</h3><p id="duel-description">A 每期保留同一組號碼；B 由第二期起重新隨機選號。雙方每期一注 $10，共用完全相同嘅歷史攪珠。</p></div>
        <label className="duel-length"><span id="duel-length-label">對決長度</span><Select value={length} onValueChange={setLength}><SelectTrigger aria-labelledby="duel-length-label"><SelectValue/></SelectTrigger><SelectContent>{[10,20,50,100].filter(n=>n<available.length).map(n=><SelectItem key={n} value={String(n)}>{n} 期</SelectItem>)}<SelectItem value={String(available.length)}>全部 {available.length} 期</SelectItem></SelectContent></Select></label>
        <p className="duel-range">第 {selected[0]?.drawNo} → {selected.at(-1)?.drawNo} 期<br/>{selected[0]?.drawDate} 至 {selected.at(-1)?.drawDate} · 每方成本 {cash(selected.length*10)}</p>
        <div className="duel-origin"><span>兩個宇宙共用嘅第一組號碼</span><div>{fixed.map(n=><Ball key={n} number={n} small/>)}</div><button className="control-button" onClick={()=>setSeed(entropy())}><Shuffle size={16}/> 換一組起始號碼</button></div>
        <p className="history-note">呢局係歷史模擬，結果只在對決內計算。關閉後結束本局，唔會加入主頁投注戰績或中獎收藏。</p>
      </section>:<>
        <section className={`duel-status ${finished?'duel-complete':''}`} aria-live="polite"><span>{finished?'對決完成':running?'同步揭曉中':'對決已暫停'} · {completed} / {rounds.length} 期</span><h3>{finished?resultText:completed?verdict==='unpriced'?'暫以已知派彩比較':verdict==='tie'?'暫時平手':verdict==='fixed'?'固定號碼暫時領先':'每期換號暫時領先':'兩個宇宙，由同一組號碼出發'}</h3><progress value={completed} max={rounds.length}/></section>
        {active&&<section className="duel-draw"><span>{revealing?'正在對照':'翻查結果'}：第 {active.draw.drawNo} 期 · {active.draw.drawDate}</span><div>{active.draw.numbers.map(n=><Ball key={n} number={n} small/>)}<b>+</b><Ball number={active.draw.extra} small extra/></div></section>}
        <div className="duel-lanes">{(['fixed','random'] as const).map(side=>{const t=totals[side],ticket=active?.[side];return <section key={side} className={`duel-lane duel-${side}`}><div className="duel-lane-title"><b>{side==='fixed'?'A':'B'}</b><div><h3>{side==='fixed'?'固定號碼':'每期換號'}</h3><span>{side==='fixed'?'一組號碼，堅持到底':'每期重新隨機選號'}</span></div></div>
          {ticket&&<div key={active?.draw.drawNo} className={`duel-ticket auto-pick-card ${revealing?'drawing':ticket.tier>=0?'winning':'losing'}`}><div className="ticket-balls">{ticket.pick.map(n=><Ball key={n} number={n} small extra={!revealing&&ticket.tier>=0&&n===active?.draw.extra} muted={!revealing&&ticket.tier>=0&&!active?.draw.numbers.includes(n)&&n!==active?.draw.extra}/>)}</div><strong>{revealing?'揭曉中…':ticket.tier<0?'本期未中':`${TIERS[ticket.tier]} · ${ticket.prize===null?'未有派彩':cash(ticket.prize)}`}</strong></div>}
          <div className="duel-money"><span>{t.unpriced?'已知淨額':'累計淨額'}</span><strong className={t.net>=0?'positive':'negative'}>{cash(t.net)}</strong><p>成本 {cash(t.cost)} · {t.unpriced?'已知獎金':'獎金'} {cash(t.prize)}</p><p>{t.wins.reduce((a,b)=>a+b,0)} 注中獎{t.unpriced?` · ${t.unpriced} 注未有派彩`:''}</p></div>
          <div className="duel-tier-counts">{TIERS.map((tier,i)=><span key={tier} className={t.wins[i]?'hit':''}>{tier}<b>{t.wins[i]}</b></span>)}</div>
        </section>;})}</div>
        <p className="history-note">{rounds.some(r=>r.draw.standardLowerPrizes)?'部分歷史期數採用標準四至七獎派彩。':''} 固定號碼同每期換號嘅單注中獎機率相同；今局結果唔代表下次優勢。</p>
        {completed>0&&<section className="duel-history"><h3>逐期戰況 <small>點選一行翻查雙方號碼</small></h3><div className="duel-history-scroll"><table><thead><tr><th>期數</th><th>A 固定</th><th>B 換號</th></tr></thead><tbody>{settled.map((r,i)=><tr key={`${r.draw.drawDate}:${r.draw.drawNo}`} className={shown===i?'selected':''}><th><button onClick={()=>{setRunning(false);setPhase('result');setReview(i);body.current?.scrollTo({top:0,behavior:'smooth'});}} aria-label={`翻查第 ${r.draw.drawNo} 期`}>{r.draw.drawNo}</button></th>{(['fixed','random'] as const).map(side=><td key={side}>{r[side].tier<0?'—':<><b>{TIERS[r[side].tier]}</b><span>{r[side].prize===null?'未有派彩':cash(r[side].prize!)}</span></>}</td>)}</tr>)}</tbody></table></div></section>}
      </>}
    </div>
    <footer className="duel-footer">{!started?<button className="primary-action" disabled={!seed||!selected.length} onClick={start}>開始對決 · {selected.length} 期</button>:finished?<button className="primary-action" onClick={reset}>新一局 · 重新抽號碼</button>:<><button className="primary-action" onClick={()=>{setReview(null);setRunning(!running);}}>{running?<Pause size={17}/>:<Play size={17}/>} {running?'暫停':'繼續'}</button><button className="control-button" onClick={()=>{setRunning(false);setCompleted(rounds.length);setReview(null);body.current?.scrollTo({top:0});sound.current('settle');}}><FastForward size={17}/> 即時結算</button></>}
      {started&&!finished&&<button className="control-button" onClick={()=>setSpeed(speed==='1'?'3':'1')} aria-label="切換對決速度">{speed}×</button>}<button className="control-button" onClick={props.onMute} aria-label={props.muted?'開啟音效':'靜音'}>{props.muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button>
    </footer>
  </AutoBetDialogContent></Dialog>;
}
