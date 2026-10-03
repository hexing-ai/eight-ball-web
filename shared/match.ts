// Shared state machine: authoritative on the server, local-only in the Pages demo.
import { rack, canPlace } from "./physics.js";
import { adjudicate } from "./rules.js";
import { other, PHYSICS_VERSION, RULES_VERSION, type Ball, type Group, type Seat, type Shot, type Simulation, type Vec } from "./types.js";

export class GameError extends Error { constructor(public code: string) { super(code); } }
export type Phase="waiting"|"aiming"|"simulating"|"animating"|"finished";
export interface Player { name:string; connected:boolean; ready:boolean; rematch:boolean; disconnectedAt:number|null }
export interface ActiveShot { id:string; shooter:Seat; input:Shot; before:Ball[]; startsAt:number; duration:number }
interface Operation { fingerprint:string; status:"accepted"|"settled"|"failed"; error?:string }
export class Match {
  matchId=globalThis.crypto.randomUUID(); turnVersion=0; revision=0; phase:Phase="waiting";
  players:[Player|null,Player|null]=[null,null];
  balls:Ball[]=rack(1); groups:[Group|null,Group|null]=[null,null];
  current:Seat=0; breaker:Seat=0; breakShot=true; ballInHand=false;
  winner:Seat|null=null; reason="等待好友"; deadline:number|null=null;
  activeShot:ActiveShot|null=null;
  private pending:Simulation|null=null;
  private operations=new Map<string,Operation>();
  private shotKey:string|null=null;
  private pausedRemaining:number|null=null;
  constructor(public turnMs=60_000,public reconnectMs=60_000,private seed:()=>number=()=>1+(globalThis.crypto.getRandomValues(new Uint32Array(1))[0]%0x7ffffffe)) {}
  touch(){this.revision++;}
  join(seat:Seat,name:string) {
    if(this.players[seat]) throw new GameError("SEAT_OCCUPIED");
    this.players[seat]={name,connected:true,ready:false,rematch:false,disconnectedAt:null};this.touch();
  }
  setConnected(seat:Seat,connected:boolean,now:number) {
    const p=this.players[seat];if(!p)return;
    p.connected=connected;p.disconnectedAt=connected?null:now;
    if(!connected&&this.phase==="aiming"&&this.deadline!==null) {
      this.pausedRemaining=Math.max(1000,this.deadline-now);this.deadline=null;
    }
    if(connected&&this.allConnected()&&this.phase==="aiming"&&this.deadline===null) {
      this.deadline=now+(this.pausedRemaining??this.turnMs);this.pausedRemaining=null;
    }
    this.touch();
  }
  allConnected(){return this.players.every(p=>p?.connected);}
  ready(seat:Seat,now:number) {
    if(this.phase!=="waiting") throw new GameError("NOT_WAITING");
    if(!this.players[seat]) throw new GameError("NO_PLAYER");
    this.players[seat]!.ready=true;
    if(this.players.every(p=>p?.ready&&p.connected)) this.start((this.seed()%2) as Seat,now);
    this.touch();
  }
  private start(breaker:Seat,now:number) {
    this.matchId=globalThis.crypto.randomUUID();this.turnVersion++;this.phase="aiming";
    this.breaker=breaker;this.current=breaker;this.breakShot=true;this.ballInHand=false;
    this.balls=rack(this.seed());this.groups=[null,null];this.winner=null;this.reason="开球";
    this.deadline=now+this.turnMs;this.activeShot=null;this.pending=null;this.operations.clear();
    for(const p of this.players) if(p) {p.rematch=false;p.ready=true;}
    this.touch();
  }
  requireTurn(seat:Seat,version:number,now:number) {
    this.tick(now);
    if(this.phase!=="aiming") throw new GameError("NOT_AIMING");
    if(!this.allConnected()) throw new GameError("WAITING_RECONNECT");
    if(this.current!==seat) throw new GameError("NOT_YOUR_TURN");
    if(this.turnVersion!==version) throw new GameError("STALE_TURN");
  }
  place(seat:Seat,version:number,position:Vec,now:number) {
    this.requireTurn(seat,version,now);
    if(!this.ballInHand) throw new GameError("NO_BALL_IN_HAND");
    if(!canPlace(this.balls,position)) throw new GameError("INVALID_PLACEMENT");
    const cue=this.balls.find(b=>b.id===0)!;
    Object.assign(cue,position,{pocketed:false,vx:0,vy:0,wx:0,wy:0});
    this.ballInHand=false;this.turnVersion++;this.touch();
  }
  beginShot(seat:Seat,version:number,id:string,input:Shot,now:number): {duplicate:boolean;operation:Operation} {
    const key=seat+":"+id,fingerprint=JSON.stringify({version,input});
    const old=this.operations.get(key);
    if(old) {if(old.fingerprint!==fingerprint)throw new GameError("OPERATION_CONFLICT");return {duplicate:true,operation:old};}
    this.requireTurn(seat,version,now);
    if(this.ballInHand)throw new GameError("PLACE_CUE_FIRST");
    const op:Operation={fingerprint,status:"accepted"};
    this.operations.set(key,op);this.shotKey=key;
    if(this.operations.size>256)this.operations.delete(this.operations.keys().next().value!);
    this.activeShot={id,shooter:seat,input:structuredClone(input),before:structuredClone(this.balls),startsAt:now,duration:0};
    this.phase="simulating";this.deadline=null;this.touch();
    return {duplicate:false,operation:op};
  }
  acceptSimulation(result:Simulation,now:number) {
    if(this.phase!=="simulating"||!this.activeShot)return;
    this.pending=result;this.activeShot.startsAt=now;this.activeShot.duration=result.duration;
    this.phase="animating";this.touch();
  }
  failSimulation(now:number) {
    if(!this.activeShot)return;
    const op=this.operations.get(this.shotKey!);
    if(op){op.status="failed";op.error="SIMULATION_FAILED";}
    this.activeShot=null;this.pending=null;this.phase="aiming";
    this.deadline=this.allConnected()?now+this.turnMs:null;
    this.reason="本杆计算失败，请重试";this.touch();
  }
  operation(seat:Seat,id:string){const op=this.operations.get(seat+":"+id);return op?{status:op.status,error:op.error}:null;}
  private settle(now:number) {
    const a=this.activeShot!,result=this.pending!;
    const ruling=adjudicate({shooter:a.shooter,groups:this.groups,breakShot:this.breakShot,before:a.before},result.events);
    this.balls=ruling.rerack?rack(this.seed()):result.balls;
    this.groups=ruling.groups;this.current=ruling.next;this.ballInHand=ruling.ballInHand;
    this.breakShot=ruling.rerack;this.reason=ruling.reason;
    this.winner=ruling.winner;this.phase=ruling.finished?"finished":"aiming";
    if(this.ballInHand) this.balls.find(b=>b.id===0)!.pocketed=true;
    const op=this.operations.get(this.shotKey!);if(op)op.status="settled";
    this.activeShot=null;this.pending=null;this.turnVersion++;
    this.deadline=this.phase==="aiming"&&this.allConnected()?now+this.turnMs:null;
    this.pausedRemaining=null;this.touch();
  }
  finish(winner:Seat|null,reason:string) {
    this.winner=winner;this.reason=reason;this.phase="finished";this.deadline=null;
    const op=this.operations.get(this.shotKey!);if(op?.status==="accepted"){op.status="failed";op.error="MATCH_ENDED";}
    this.activeShot=null;this.pending=null;this.touch();
  }
  resign(seat:Seat){if(this.phase==="waiting"||this.phase==="finished")throw new GameError("NO_ACTIVE_MATCH");this.finish(other(seat),"对方认输");}
  rematch(seat:Seat,now:number) {
    if(this.phase!=="finished")throw new GameError("MATCH_NOT_FINISHED");
    this.players[seat]!.rematch=true;
    if(this.players.every(p=>p?.rematch&&p.connected))this.start(other(this.breaker),now);
    this.touch();
  }
  tick(now:number) {
    if(this.phase==="animating"&&this.activeShot&&now>=this.activeShot.startsAt+this.activeShot.duration*1000)this.settle(now);
    if(this.phase==="finished"||this.phase==="waiting")return;
    const disconnected=this.players.map((p,i)=>({p,seat:i as Seat})).filter(({p})=>p&&!p.connected);
    if(disconnected.length===2&&disconnected.every(({p})=>now-p!.disconnectedAt!>=this.reconnectMs)){this.finish(null,"双方断线，本局结束");return;}
    if(disconnected.length===1&&now-disconnected[0].p!.disconnectedAt!>=this.reconnectMs){this.finish(other(disconnected[0].seat),"对方断线超时");return;}
    if(this.phase==="aiming"&&this.allConnected()&&this.deadline!==null&&now>=this.deadline){
      this.current=other(this.current);this.ballInHand=true;this.balls.find(b=>b.id===0)!.pocketed=true;
      this.breakShot=false;this.turnVersion++;this.deadline=now+this.turnMs;this.reason="击球超时，对方自由球";this.touch();
    }
  }
  snapshot(now:number) {
    return structuredClone({
      matchId:this.matchId,turnVersion:this.turnVersion,revision:this.revision,phase:this.phase,
      players:this.players,balls:this.balls,groups:this.groups,current:this.current,breaker:this.breaker,
      breakShot:this.breakShot,ballInHand:this.ballInHand,winner:this.winner,reason:this.reason,
      deadline:this.deadline,activeShot:this.activeShot,serverTime:now,
      physicsVersion:PHYSICS_VERSION,rulesVersion:RULES_VERSION,reconnectMs:this.reconnectMs,
    });
  }
}
