import { Worker } from "node:worker_threads";
import type { Ball, Shot, Simulation } from "../shared/types.js";
interface Job{id:number;balls:Ball[];shot:Shot;resolve:(s:Simulation)=>void;reject:(e:Error)=>void}
interface Slot{worker:Worker;job?:Job;timer?:NodeJS.Timeout}
export class SimulationPool {
  private slots:Slot[]=[];private queue:Job[]=[];private seq=0;private closed=false;
  constructor(count=2,private timeoutMs=5000){for(let i=0;i<count;i++)this.slots.push(this.spawn());}
  private spawn():Slot {
    const slot:Slot={worker:new Worker(new URL("./simulation-worker.js",import.meta.url))};
    slot.worker.on("message",({id,result,error})=>{
      const job=slot.job;if(!job||job.id!==id)return;
      clearTimeout(slot.timer);slot.job=undefined;
      if(error)job.reject(new Error(error));else job.resolve(result);
      this.drain();
    });
    slot.worker.on("error",e=>this.replace(slot,e));
    slot.worker.on("exit",code=>{if(code!==0&&this.slots.includes(slot))this.replace(slot,new Error("WORKER_EXIT"));});
    return slot;
  }
  private replace(slot:Slot,error:Error){
    const index=this.slots.indexOf(slot);if(index<0||this.closed)return;
    clearTimeout(slot.timer);slot.job?.reject(error);
    this.slots.splice(index,1);void slot.worker.terminate();
    this.slots.push(this.spawn());this.drain();
  }
  run(balls:Ball[],shot:Shot):Promise<Simulation>{
    if(this.closed||this.queue.length>=64)return Promise.reject(new Error("SERVER_BUSY"));
    return new Promise((resolve,reject)=>{this.queue.push({id:++this.seq,balls:structuredClone(balls),shot,resolve,reject});this.drain();});
  }
  private drain(){
    if(this.closed)return;
    for(const slot of this.slots)if(!slot.job&&this.queue.length){
      const job=this.queue.shift()!;slot.job=job;
      slot.timer=setTimeout(()=>this.replace(slot,new Error("SIMULATION_TIMEOUT")),this.timeoutMs);
      slot.worker.postMessage({id:job.id,balls:job.balls,shot:job.shot});
    }
  }
  async close(){
    this.closed=true;for(const job of this.queue)job.reject(new Error("SERVER_CLOSED"));this.queue=[];
    await Promise.all(this.slots.map(slot=>{clearTimeout(slot.timer);slot.job?.reject(new Error("SERVER_CLOSED"));return slot.worker.terminate();}));
    this.slots=[];
  }
}
