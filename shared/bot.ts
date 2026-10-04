import { canPlace, POCKETS, simulate, TABLE } from './physics.js';
import { adjudicate } from './rules.js';
import { groupOf, type Ball, type Group, type Shot, type Vec } from './types.js';

export interface BotPosition { balls: Ball[]; groups: [Group|null, Group|null]; breakShot: boolean; ballInHand: boolean }
export interface BotPlan { shot: Shot; position?: Vec }
const R = TABLE.radius;
const distance = (a: Vec, b: Vec) => Math.hypot(a.x-b.x, a.y-b.y);
export function botTargets(state: BotPosition): Ball[] {
  const own = state.groups[1];
  const remaining = state.balls.filter(b => !b.pocketed && b.id !== 0 && b.id !== 8 && (own === null || groupOf(b.id) === own));
  return remaining.length ? remaining : own !== null ? state.balls.filter(b => b.id === 8 && !b.pocketed) : [];
}
function clearPath(a: Vec, b: Vec, balls: Ball[], ignore: number[]): boolean {
  const dx=b.x-a.x, dy=b.y-a.y, d2=dx*dx+dy*dy;
  return balls.every(ball => {
    if (ball.pocketed || ignore.includes(ball.id)) return true;
    const t=Math.max(0, Math.min(1, ((ball.x-a.x)*dx+(ball.y-a.y)*dy)/(d2||1)));
    return distance(ball,{x:a.x+t*dx,y:a.y+t*dy})>R*2+.001;
  });
}
function ghost(target: Vec, pocket: Vec): Vec {
  const d=distance(target,pocket)||1;
  return {x:target.x+(target.x-pocket.x)/d*R*2,y:target.y+(target.y-pocket.y)/d*R*2};
}
/** Choose a legal cue position with a direct pot available, then fall back to a grid. */
export function botPlacement(state: BotPosition): Vec {
  const candidates: {point:Vec; rank:number}[]=[];
  for(const target of botTargets(state)) for(const pocket of POCKETS) {
    const g=ghost(target,pocket), d=distance(target,pocket)||1;
    for(const back of [.22,.4,.65]) {
      const point={x:g.x+(target.x-pocket.x)/d*back,y:g.y+(target.y-pocket.y)/d*back};
      if(canPlace(state.balls,point)&&clearPath(point,g,state.balls,[0,target.id])&&clearPath(target,pocket,state.balls,[0,target.id]))
        candidates.push({point,rank:d+back*.3});
    }
  }
  candidates.sort((a,b)=>a.rank-b.rank);
  if(candidates[0])return candidates[0].point;
  for(let x=.12;x<TABLE.width-.08;x+=.12)for(let y=.12;y<TABLE.height-.08;y+=.12)
    if(canPlace(state.balls,{x,y}))return {x,y};
  throw new Error('INVALID_PLACEMENT');
}
/** Bounded, deterministic shot search. Run in a Worker; no model API or network. */
export function chooseBotShot(state: BotPosition): BotPlan {
  const position=state.ballInHand?botPlacement(state):undefined;
  const balls=structuredClone(state.balls), cue=balls.find(b=>b.id===0)!;
  if(position)Object.assign(cue,position,{pocketed:false});
  const targets=botTargets({...state,balls});
  if(state.breakShot){
    const apex=balls.filter(b=>b.id!==0&&!b.pocketed).sort((a,b)=>a.x-b.x)[0];
    return {position,shot:{angle:Math.atan2(apex.y-cue.y,apex.x-cue.x),power:.82,spin:0}};
  }
  const candidates:{shot:Shot;rank:number}[]=[];
  for(const target of targets) {
    for(const pocket of POCKETS) {
      const g=ghost(target,pocket), travel=distance(cue,g), objectTravel=distance(target,pocket);
      if(g.x<R||g.x>TABLE.width-R||g.y<R||g.y>TABLE.height-R)continue;
      const alignment=((g.x-cue.x)*(pocket.x-target.x)+(g.y-cue.y)*(pocket.y-target.y))/((travel*objectTravel)||1);
      if(alignment<.18||!clearPath(cue,g,balls,[0,target.id])||!clearPath(target,pocket,balls,[0,target.id]))continue;
      const angle=Math.atan2(g.y-cue.y,g.x-cue.x);
      const base=Math.max(.14,Math.min(.55,Math.sqrt(travel+objectTravel/Math.max(.3,alignment))*.18));
      for(const factor of [.8,1,1.25])for(const spin of [0,-.25])
        candidates.push({shot:{angle,power:Math.min(.8,base*factor),spin},rank:alignment*4-travel*.35-objectTravel*.6});
    }
    // Legal-contact options are still available when no unobstructed pot exists.
    for(const offset of [0,-.055,.055])for(const power of [.24,.45])
      candidates.push({shot:{angle:Math.atan2(target.y-cue.y,target.x-cue.x)+offset,power,spin:0},rank:-5-distance(cue,target)});
  }
  candidates.sort((a,b)=>b.rank-a.rank);
  // Reserve some legal-contact attempts alongside the strongest pot candidates.
  const selected=[...candidates.filter(c=>c.rank>-5).slice(0,42),...candidates.filter(c=>c.rank<=-5).slice(0,12)];
  let best:Shot={angle:0,power:.3,spin:0}, bestScore=-Infinity;
  for(const {shot} of selected) {
    const result=simulate(balls,shot);
    const ruling=adjudicate({shooter:1,groups:state.groups,breakShot:false,before:balls},result.events);
    let score=ruling.finished?(ruling.winner===1?10000:-10000):ruling.foul?-600:0;
    const own=state.groups[1];
    for(const e of result.events)if(e.type==='pocket') {
      if(e.ball===0)score-=300;
      else if(e.ball!==8)score+=(own===null||groupOf(e.ball)===own)?120:-25;
    }
    if(ruling.next===1&&!ruling.finished)score+=25;
    score-=shot.power*3;
    if(score>bestScore){bestScore=score;best=shot;}
  }
  return {position,shot:best};
}
