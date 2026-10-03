import { performance } from "node:perf_hooks";
import { SimulationPool } from "../server/simulation-pool.js";
import {rack,predict} from "../shared/physics.js";
const pool=new SimulationPool(2);
try{
  const start=performance.now();
  const jobs=Array.from({length:20},(_,i)=>({balls:rack(i+1),shot:{angle:(i-10)*0.006,power:0.65,spin:(i%3-1)*0.6}}));
  const results=await Promise.all(jobs.map(j=>pool.run(j.balls,j.shot)));
  const elapsed=performance.now()-start;
  const times:number[]=[];
  for(const j of jobs){const t=performance.now();predict(j.balls,j.shot);times.push(performance.now()-t);}
  times.sort((a,b)=>a-b);
  console.log(JSON.stringify({scenario:"20 concurrent shot jobs, 2 workers (not a full network load test)",allSettled:results.every(r=>r.balls.every(b=>b.vx===0&&b.vy===0)),elapsedMs:Math.round(elapsed),previewP95Ms:+times[Math.ceil(times.length*.95)-1].toFixed(2),node:process.version},null,2));
}finally{await pool.close();}
