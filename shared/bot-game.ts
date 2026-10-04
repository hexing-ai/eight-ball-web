import { GameError, Match } from './match.js';
import type { BotPlan, BotPosition } from './bot.js';
import type { Ball, Shot, Simulation, Vec } from './types.js';
type Command={type:string;requestId?:string;turnVersion?:number;shot?:Shot;position?:Vec};
type Snapshot=ReturnType<Match['snapshot']>;
/** Human is always seat 0; computer is always seat 1. Rules remain shared with multiplayer. */
export class BotGame {
  private game!:Match;
  private generation=0;
  private stopped=true;
  private thinking=false;
  private due=0;
  private plan:{value:BotPlan;version:number}|null=null;
  constructor(
    private simulate:(balls:Ball[],shot:Shot)=>Promise<Simulation>,
    private choose:(state:BotPosition)=>Promise<BotPlan>,
    private onSnapshot:(state:Snapshot)=>void,
    private onError:(message:string)=>void,
    private onAim:(angle:number)=>void=()=>{},
    private now:()=>number=Date.now,
  ) {}
  start(){
    this.generation++;this.stopped=false;this.thinking=false;this.plan=null;this.due=this.now()+750;
    let first=true;
    this.game=new Match(60_000,60_000,()=>{if(first){first=false;return 2;}return 1+crypto.getRandomValues(new Uint32Array(1))[0]%0x7ffffffe;});
    this.game.join(0,'你');this.game.join(1,'电脑');this.game.ready(0,this.now());this.game.ready(1,this.now());this.emit();
  }
  stop(){this.stopped=true;this.generation++;this.plan=null;}
  private emit(){if(!this.stopped)this.onSnapshot(this.game.snapshot(this.now()));}
  tick(){
    if(this.stopped)return;
    const revision=this.game.revision;this.game.tick(this.now());
    if(revision!==this.game.revision){this.due=this.now()+750;this.emit();}
    if(this.game.phase!=='aiming'||this.game.current!==1||this.thinking||this.now()<this.due)return;
    if(this.plan){const plan=this.plan;this.plan=null;if(plan.version===this.game.turnVersion)void this.playBot(plan.value);}
    else void this.think();
  }
  private async think(){
    const game=this.game,generation=this.generation,version=game.turnVersion;
    this.thinking=true;
    try{
      const value=await this.choose({balls:structuredClone(game.balls),groups:[...game.groups],breakShot:game.breakShot,ballInHand:game.ballInHand});
      if(this.stopped||generation!==this.generation)return;
      if(game.phase==='aiming'&&game.current===1&&game.turnVersion===version){this.plan={value,version};this.onAim(value.shot.angle);this.due=this.now()+500;}
    }catch{
      if(this.stopped||generation!==this.generation)return;
      if(game.phase==='aiming'&&game.current===1&&game.turnVersion===version){game.finish(null,'电脑计算未完成，请重新开局');this.emit();}
    }finally{if(generation===this.generation)this.thinking=false;}
  }
  private async playBot(plan:BotPlan){
    const game=this.game;
    try{
      if(game.ballInHand){if(!plan.position)throw new GameError('INVALID_PLACEMENT');game.place(1,game.turnVersion,plan.position,this.now());this.emit();}
      await this.shoot(1,game.turnVersion,crypto.randomUUID(),plan.shot);
    }catch(error){this.onError(error instanceof Error?error.message:String(error));this.due=this.now()+1500;}
  }
  private async shoot(seat:0|1,version:number,id:string,shot:Shot){
    const game=this.game,generation=this.generation;
    const result=game.beginShot(seat,version,id,shot,this.now());
    if(result.duplicate)return;
    this.emit();
    try{
      const simulation=await this.simulate(structuredClone(game.balls),shot);
      if(this.stopped||generation!==this.generation||game.phase!=='simulating')return;
      game.acceptSimulation(simulation,this.now());this.emit();
    }catch(error){
      if(this.stopped||generation!==this.generation||game.phase!=='simulating')return;
      game.failSimulation(this.now());this.onError('SIMULATION_FAILED');this.due=this.now()+1500;this.emit();
    }
  }
  async send(command:Command){
    if(this.stopped)return;
    const game=this.game;
    try{
      switch(command.type){
        case 'aim':return;
        case 'shot':if(command.shot&&command.turnVersion!==undefined&&command.requestId)await this.shoot(0,command.turnVersion,command.requestId,command.shot);return;
        case 'place':if(command.position&&command.turnVersion!==undefined)game.place(0,command.turnVersion,command.position,this.now());break;
        case 'resign':game.resign(0);this.plan=null;break;
        case 'rematch':if(game.phase!=='finished')throw new GameError('MATCH_NOT_FINISHED');this.generation++;this.thinking=false;this.plan=null;game.rematch(0,this.now());game.rematch(1,this.now());this.due=this.now()+750;break;
      }
      this.emit();
    }catch(error){this.onError(error instanceof Error?error.message:String(error));this.emit();}
  }
}
