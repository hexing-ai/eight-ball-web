import type { Ball,Guide,Shot,Simulation } from '../shared/types.js';
import type { BotPlan,BotPosition } from '../shared/bot.js';
export class PhysicsClient{
  private worker=new Worker(new URL('./physics-worker.ts',import.meta.url),{type:'module'});
  private id=0;
  private active=false;
  private queued:{id:number;balls:Ball[];shot:Shot;done:(g:Guide|null)=>void}|null=null;
  private callbacks=new Map<number,(result:any,error?:string)=>void>();
  constructor(private onError:(message:string)=>void){
    this.worker.onmessage=({data})=>{const cb=this.callbacks.get(data.id);this.callbacks.delete(data.id);cb?.(data.result,data.error);};
    this.worker.onerror=()=>{for(const cb of this.callbacks.values())cb(null,'轨迹计算暂不可用，请刷新页面');this.callbacks.clear();this.onError('轨迹计算暂不可用，请刷新页面');};
  }
  preview(balls:Ball[],shot:Shot,done:(g:Guide|null)=>void){
    const item={id:++this.id,balls,shot,done};this.queued=item;this.flush();
  }
  private flush(){
    if(this.active||!this.queued)return;
    const job=this.queued;this.queued=null;this.active=true;
    this.callbacks.set(job.id,(result,error)=>{this.active=false;job.done(error?null:result);this.flush();});
    this.worker.postMessage({id:job.id,type:'predict',balls:job.balls,shot:job.shot});
  }
  chooseBot(state:BotPosition):Promise<BotPlan>{
    const id=++this.id;
    return new Promise((resolve,reject)=>{this.callbacks.set(id,(result,error)=>error?reject(new Error(error)):resolve(result));this.worker.postMessage({id,type:'bot',state});});
  }
  simulate(balls:Ball[],shot:Shot):Promise<Simulation>{
    const id=++this.id;
    return new Promise((resolve,reject)=>{this.callbacks.set(id,(result,error)=>error?reject(new Error(error)):resolve(result));this.worker.postMessage({id,type:'simulate',balls,shot});});
  }
}
