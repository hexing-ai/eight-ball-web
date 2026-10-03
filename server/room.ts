import { Room, type Client, ServerError, CloseCode } from "@colyseus/core";
import { randomInt } from "node:crypto";
import { command, joinOptions } from "./protocol.js";
import { Match, GameError } from "./match.js";
import type { Seat } from "../shared/types.js";
import type { SimulationPool } from "./simulation-pool.js";
import type { CheckpointStore } from "./store.js";
export interface Services{
  pool:SimulationPool;store:CheckpointStore;directory:Map<string,{roomId:string;room:any}>;
  reconnectMs:number;turnMs:number;waitingMs:number;maxRooms:number;
}
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function invite(){return Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join("");}
export function createPoolRoom(s:Services): new () => Room {
  return class PoolRoom extends Room {
    game=new Match(s.turnMs,s.reconnectMs);code="";private creatorKey="";private disposed=false;
    private lastActivity=Date.now();private buckets=new Map<string,{at:number;n:number}>();
    private shuttingDown=false;
    async onCreate(options:unknown){
      const parsed=joinOptions.safeParse(options);
      if(!parsed.success||!parsed.data.creatorKey)throw new ServerError(400,"INVALID_CREATE");
      if(s.directory.size>=s.maxRooms)throw new ServerError(503,"SERVER_FULL");
      this.creatorKey=parsed.data.creatorKey;this.maxClients=2;this.seatReservationTimeout=15;
      do{this.code=invite();}while(s.directory.has(this.code)||s.store.read(this.code));
      s.directory.set(this.code,{roomId:this.roomId,room:this});
      await this.setPrivate(true);
      this.onMessage("command",(client,data)=>{void this.handle(client,data);});
      this.onMessage("*",(client)=>client.send("error",{code:"UNKNOWN_MESSAGE"}));
      this.setSimulationInterval(()=>{
        const revision=this.game.revision;
        this.game.tick(Date.now());
        if(this.game.revision!==revision)this.publish();
        if((this.game.phase==="waiting"||this.game.phase==="finished")&&Date.now()-this.lastActivity>s.waitingMs)void this.disconnect();
      },100);
    }
    onAuth(_client:Client,options:unknown){
      const parsed=joinOptions.safeParse(options);
      if(!parsed.success)throw new ServerError(400,"INVALID_JOIN");
      const o=parsed.data;
      if(!this.game.players[0]&&o.creatorKey===this.creatorKey)return {seat:0,name:o.nickname};
      if(this.game.phase!=="waiting"||this.game.players[1]||o.inviteCode!==this.code)throw new ServerError(403,"INVITE_REQUIRED_OR_FULL");
      return {seat:1,name:o.nickname};
    }
    onJoin(client:Client,_options:unknown,auth:{seat:Seat;name:string}){
      client.userData={seat:auth.seat};this.game.join(auth.seat,auth.name);
      this.lastActivity=Date.now();this.welcome(client);this.publish();
    }
    private welcome(client:Client){client.send("welcome",{seat:client.userData.seat,inviteCode:this.code,roomId:this.roomId,protocol:1});}
    private publish(){
      if(this.disposed)return;
      const state=this.game.snapshot(Date.now());
      this.broadcast("snapshot",state);
      if(state.phase!=="simulating"&&state.phase!=="animating"){
        try{s.store.write(this.code,state);}catch{console.error(JSON.stringify({event:"checkpoint_failed",roomId:this.roomId}));}
      }
    }
    private rate(client:Client){
      const now=Date.now(),old=this.buckets.get(client.sessionId);
      if(!old||now-old.at>1000){this.buckets.set(client.sessionId,{at:now,n:1});return true;}
      return ++old.n<=30;
    }
    private async handle(client:Client,data:unknown){
      if(this.disposed)return;
      if(!this.rate(client)){client.send("error",{code:"RATE_LIMITED"});return;}
      const parsed=command.safeParse(data);
      if(!parsed.success){client.send("error",{code:"INVALID_COMMAND"});return;}
      const c=parsed.data,seat=client.userData?.seat as Seat,now=Date.now();
      const ack=(details:object={})=>client.send("ack",{requestId:c.requestId,...details});
      try {
        if(seat!==0&&seat!==1)throw new GameError("NO_PLAYER");
        this.lastActivity=now;
        switch(c.type){
          case "sync":this.welcome(client);client.send("snapshot",this.game.snapshot(now));ack();return;
          case "status":ack({operation:this.game.operation(seat,c.operationId)});return;
          case "ready":this.game.ready(seat,now);break;
          case "place":this.game.place(seat,c.turnVersion,c.position,now);break;
          case "resign":this.game.resign(seat);break;
          case "rematch":this.game.rematch(seat,now);break;
          case "aim":
            this.game.requireTurn(seat,c.turnVersion,now);
            this.broadcast("aim",{seat,angle:c.angle,turnVersion:c.turnVersion},{except:client});return;
          case "shot":{
            const started=this.game.beginShot(seat,c.turnVersion,c.requestId,c.shot,now);
            ack({status:started.operation.status,duplicate:started.duplicate});
            if(started.duplicate)return;
            const activeShot=this.game.activeShot;
            this.publish();
            try {
              const result=await s.pool.run(this.game.balls,c.shot);
              if(this.disposed||this.game.phase!=="simulating"||this.game.activeShot!==activeShot)return;
              this.game.acceptSimulation(result,Date.now());
              this.broadcast("shot",this.game.activeShot);this.publish();
            }catch{
              if(this.disposed||this.game.activeShot!==activeShot)return;
              if(this.game.phase==="simulating")this.game.failSimulation(Date.now());
              this.publish();client.send("error",{requestId:c.requestId,code:"SIMULATION_FAILED"});
            }
            return;
          }
        }
        ack();this.publish();
      }catch(error){
        // tick() can change the current turn before a command is rejected.
        this.publish();
        client.send("error",{requestId:c.requestId,code:error instanceof GameError?error.code:"INTERNAL_ERROR"});
      }
    }
    onDrop(client:Client){return this.handleDeparture(client,false);}
    onLeave(client:Client,code?:number){
      // A timed-out onDrop is followed by onLeave in Colyseus 0.17.
      if(code===CloseCode.CONSENTED)return this.handleDeparture(client,true);
    }
    private async handleDeparture(client:Client,consented:boolean){
      const seat=client.userData?.seat as Seat;
      if(seat!==0&&seat!==1)return;
      this.buckets.delete(client.sessionId);
      if(this.shuttingDown)return;
      this.game.setConnected(seat,false,Date.now());this.publish();
      if(consented){
        if(this.game.phase==="waiting"){this.releaseWaitingSeat(seat);return;}
        if(this.game.phase!=="finished")this.game.finish(seat===0?1:0,"对方离开对局");
        this.publish();return;
      }
      try{
        const replacement=await this.allowReconnection(client,s.reconnectMs/1000);
        if(this.disposed)return;
        replacement.userData={seat};
        this.game.tick(Date.now());
        this.game.setConnected(seat,true,Date.now());this.welcome(replacement);this.publish();
      }catch{
        if(this.disposed||this.shuttingDown)return;
        if(this.game.phase==="waiting"){this.releaseWaitingSeat(seat);return;}
        this.game.tick(Date.now()+1);this.publish();
      }
    }
    private releaseWaitingSeat(seat:Seat){
      if(seat===0){
        this.game.finish(null,"房主已关闭房间");this.publish();void this.disconnect();
      }else{
        this.game.players[1]=null;
        if(this.game.players[0])this.game.players[0].ready=false;
        this.game.touch();this.publish();
      }
    }
    override onBeforeShutdown(){
      this.shuttingDown=true;
      if(this.game.phase!=="finished")this.game.finish(null,"服务重启，本局中断");
      this.publish();super.onBeforeShutdown();
    }
    onDispose(){this.disposed=true;s.directory.delete(this.code);}
  };
}
