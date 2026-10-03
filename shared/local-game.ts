import { Match } from './match.js';
import type { Ball, Shot, Simulation, Vec } from './types.js';

type LocalCommand = {type:string;requestId?:string;turnVersion?:number;shot?:Shot;position?:Vec};
type Snapshot = ReturnType<Match['snapshot']>;

/** Same rules and physics, two people taking turns on one device. No network. */
export class LocalGame {
  private game = new Match(60_000);
  private generation = 0;
  private stopped = false;
  constructor(
    private simulate:(balls:Ball[],shot:Shot)=>Promise<Simulation>,
    private onSnapshot:(snapshot:Snapshot)=>void,
    private onError:(message:string)=>void,
    private now:()=>number=Date.now,
  ) {}
  start() {
    this.generation++;this.stopped=false;this.game=new Match(60_000);
    this.game.join(0,'玩家一');this.game.join(1,'玩家二');
    this.game.ready(0,this.now());this.game.ready(1,this.now());this.emit();
  }
  stop() {this.stopped=true;this.generation++;}
  tick() {
    if(this.stopped)return;
    const revision=this.game.revision;this.game.tick(this.now());
    if(this.game.revision!==revision)this.emit();
  }
  private emit() {if(!this.stopped)this.onSnapshot(this.game.snapshot(this.now()));}
  async send(command:LocalCommand) {
    if(this.stopped)return;
    const game=this.game,generation=this.generation;
    try {
      switch(command.type) {
        case 'shot': {
          if(!command.shot||command.turnVersion===undefined||!command.requestId)return;
          const result=game.beginShot(game.current,command.turnVersion,command.requestId,command.shot,this.now());
          if(result.duplicate)return;
          this.emit();
          const simulation=await this.simulate(game.balls,command.shot);
          if(generation!==this.generation||this.stopped)return;
          game.acceptSimulation(simulation,this.now());break;
        }
        case 'place':
          if(command.position&&command.turnVersion!==undefined)game.place(game.current,command.turnVersion,command.position,this.now());
          break;
        case 'resign':game.resign(game.current);break;
        case 'rematch':game.rematch(0,this.now());game.rematch(1,this.now());break;
        case 'aim':return;
      }
      this.emit();
    } catch(error) {
      if(generation!==this.generation||this.stopped)return;
      if(game.phase==='simulating')game.failSimulation(this.now());
      this.onError(error instanceof Error?error.message:String(error));this.emit();
    }
  }
}
