import { groupOf, other, type Ball, type Group, type PhysicsEvent, type Seat } from "./types.js";
export interface RuleContext { shooter: Seat; groups: [Group|null,Group|null]; breakShot: boolean; before: Ball[] }
export interface Ruling {
  next: Seat; groups: [Group|null,Group|null]; ballInHand: boolean;
  winner: Seat|null; finished: boolean; rerack: boolean; foul: string|null; reason: string;
}
export function adjudicate(ctx: RuleContext, events: PhysicsEvent[]): Ruling {
  const {shooter,breakShot,before}=ctx, opponent=other(shooter);
  const groups=[...ctx.groups] as [Group|null,Group|null];
  const pots=new Set(events.filter(e=>e.type==="pocket").map(e=>e.ball));
  const first=events.find(e=>e.type==="collision"&&(e.a===0||e.b===0));
  const touched=first?.type==="collision"?(first.a===0?first.b:first.a):null;
  const own=groups[shooter];
  const remaining=before.filter(b=>!b.pocketed&&groupOf(b.id)===own&&own!==null).length;
  let foul: string|null=pots.has(0)?"白球落袋":touched===null?"未碰到目标球":null;
  if(breakShot) {
    const rails=new Set(events.flatMap(e=>e.type==="cushion"&&e.ball!==0?[e.ball]:[]));
    if(!foul&&![...pots].some(id=>id!==0)&&rails.size<4) foul="开球不足四球碰库";
    if(pots.has(8)) return {next:foul?opponent:shooter,groups:[null,null],ballInHand:false,winner:null,finished:false,rerack:true,foul,reason:"开球黑八入袋，重新摆球"};
  } else if (!foul) {
    if(own===null&&touched===8) foul="开放球台先碰黑八";
    else if(own!==null&&remaining>0&&groupOf(touched!)!==own) foul="先碰对方球或黑八";
    else if(own!==null&&remaining===0&&touched!==8) foul="必须先碰黑八";
    if(!foul&&pots.size===0&&!events.some(e=>e.type==="cushion"&&e.t>=(first?.t??Infinity))) foul="触球后无进球且无球碰库";
  }
  if(!breakShot&&pots.has(8)) {
    const legal=own!==null&&remaining===0&&!foul;
    return {next:shooter,groups,ballInHand:false,winner:legal?shooter:opponent,finished:true,rerack:false,foul,reason:legal?"合法打进黑八":"提前黑八或黑八入袋时犯规"};
  }
  if(!breakShot&&!foul&&own===null) {
    const set=new Set([...pots].map(groupOf).filter((x):x is Group=>x!==null));
    if(set.size===1) { groups[shooter]=[...set][0];groups[opponent]=groups[shooter]==="solid"?"stripe":"solid"; }
  }
  const keeps=!foul&&[...pots].some(id=>id!==0&&id!==8&&(breakShot||groups[shooter]===null||groupOf(id)===groups[shooter]));
  return {next:keeps?shooter:opponent,groups,ballInHand:!!foul,winner:null,finished:false,rerack:false,foul,reason:foul??(keeps?"进球，继续击球":"交换回合")};
}
