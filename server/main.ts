import { createBackend } from "./app.js";
import { resolve } from "node:path";
function integer(name:string,fallback:number,min:number,max:number){
  const n=Number(process.env[name]??fallback);
  if(!Number.isInteger(n)||n<min||n>max)throw new Error("Invalid "+name);
  return n;
}
const production=process.env.NODE_ENV==="production";
if(production&&!process.env.ALLOWED_ORIGINS)throw new Error("Production requires ALLOWED_ORIGINS");
const port=integer("PORT",integer("_FAAS_RUNTIME_PORT",2567,1,65535),1,65535);
const backend=createBackend({
  port,host:process.env.HOST??"0.0.0.0",
  staticDir:process.env.STATIC_DIR?resolve(process.env.STATIC_DIR):undefined,
  origins:(process.env.ALLOWED_ORIGINS??"http://localhost:5173,http://127.0.0.1:5173").split(",").map(s=>s.trim()).filter(Boolean),
  dataDir:process.env.DATA_DIR??"./data",workers:integer("SIMULATION_WORKERS",2,1,8),
  reconnectMs:integer("RECONNECT_SECONDS",60,5,300)*1000,
  turnMs:integer("TURN_SECONDS",60,10,300)*1000,
  waitingMs:integer("WAITING_MINUTES",30,1,120)*60_000,maxRooms:integer("MAX_ROOMS",100,1,1000),
});
await backend.listen();
console.log(JSON.stringify({event:"backend_ready",port}));
let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;await backend.close();process.exit(0);}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
