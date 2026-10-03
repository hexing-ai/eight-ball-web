import { parentPort } from "node:worker_threads";
import { simulate } from "../shared/physics.js";
parentPort!.on("message",({id,balls,shot})=>{
  try{parentPort!.postMessage({id,result:simulate(balls,shot)});}
  catch(error){parentPort!.postMessage({id,error:error instanceof Error?error.message:"SIMULATION_FAILED"});}
});
