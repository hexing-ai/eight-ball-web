import { predict,simulate } from '../shared/physics.js';
import type { Ball,Shot } from '../shared/types.js';
self.onmessage=(event:MessageEvent<{id:number;type:'predict'|'simulate';balls:Ball[];shot:Shot}>)=>{
  const {id,type,balls,shot}=event.data;
  try{self.postMessage({id,type,result:type==='predict'?predict(balls,shot):simulate(balls,shot,{frames:true})});}
  catch{self.postMessage({id,type,error:'无法计算本杆，请重试'});}
};
