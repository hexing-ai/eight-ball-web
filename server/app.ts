import express from "express";
import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SimulationPool } from "./simulation-pool.js";
import { CheckpointStore } from "./store.js";
import { createPoolRoom, type Services } from "./room.js";
import { PHYSICS_VERSION,RULES_VERSION } from "../shared/types.js";

export interface Config {port:number;host:string;origins:string[];dataDir:string;workers:number;reconnectMs:number;turnMs:number;waitingMs:number;maxRooms:number;staticDir?:string}
export function createBackend(config:Config): {services:Services;server:Server;http:HttpServer;listen:()=>Promise<AddressInfo|string|null>;close:()=>Promise<void>} {
  const pool=new SimulationPool(config.workers),store=new CheckpointStore(config.dataDir);
  store.cleanup();
  const services:Services={pool,store,directory:new Map(),...config};
  const app=express();app.disable("x-powered-by");
  // The production website and SDK share one origin and one listening port.
  const stripSocketPrefix=(req:IncomingMessage)=>{
    if(req.url?.startsWith("/socket/"))req.url=req.url.slice("/socket".length);
  };
  app.use((req,_res,next)=>{stripSocketPrefix(req);next();});
  const allowed=(origin:string|undefined)=>!origin||config.origins.includes(origin);
  const limits=new Map<string,{at:number;n:number}>();
  const limited=(req:IncomingMessage)=>{
    const ip=req.socket.remoteAddress??"unknown",now=Date.now(),entry=limits.get(ip);
    if(!entry||now-entry.at>60_000){
      if(limits.size>10_000)limits.clear();
      limits.set(ip,{at:now,n:1});return false;
    }
    return ++entry.n>120;
  };
  const cors=(req:IncomingMessage)=>({
    "Access-Control-Allow-Origin":req.headers.origin??config.origins[0]??"http://localhost:5173",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
    // Colyseus SDK sends credentialed requests; only allowlisted Origins reach this response.
    "Access-Control-Allow-Credentials":"true",
    "Access-Control-Allow-Headers":"Content-Type,Authorization",
    "Vary":"Origin","Cache-Control":"no-store",
  });
  app.use((req,res,next)=>{
    if(!allowed(req.headers.origin)){res.status(403).json({error:"ORIGIN_NOT_ALLOWED"});return;}
    for(const[k,v]of Object.entries(cors(req)))res.setHeader(k,v);
    res.setHeader("X-Content-Type-Options","nosniff");
    if(req.method==="OPTIONS"){res.sendStatus(204);return;}
    if(req.path!=="/healthz"&&limited(req)){res.status(429).json({error:"RATE_LIMITED"});return;}
    next();
  });
  app.get("/healthz",(_req,res)=>res.json({ok:true,physicsVersion:PHYSICS_VERSION,rulesVersion:RULES_VERSION}));
  app.get("/api/config",(_req,res)=>res.json({protocol:1,physicsVersion:PHYSICS_VERSION,rulesVersion:RULES_VERSION,turnMs:config.turnMs,reconnectMs:config.reconnectMs}));
  app.get("/api/rooms/:code",(req,res)=>{
    const code=req.params.code.toUpperCase();
    if(!/^[A-Z2-9]{8}$/.test(code)){res.status(400).json({error:"INVALID_CODE"});return;}
    const entry=services.directory.get(code);
    if(entry){res.json({roomId:entry.roomId,status:entry.room.game.phase,full:entry.room.game.players.every(Boolean)});return;}
    const old=store.read(code);
    if(old){res.status(410).json({error:"ROOM_ENDED",status:old.state.phase==="finished"?"finished":"interrupted",message:"房间已结束，请创建新房间"});return;}
    res.status(404).json({error:"ROOM_NOT_FOUND"});
  });
  app.use((req,res,next)=>{if(req.path.startsWith("/matchmake/")){void handleMatchmaking(req,res);return;}next();});
  if(config.staticDir)app.use(express.static(config.staticDir,{dotfiles:"deny"}));
  app.use((_req,res)=>res.status(404).json({error:"NOT_FOUND"}));
  const http=createServer(app);
  http.requestTimeout=10_000;http.headersTimeout=10_000;
  async function handleMatchmaking(req:IncomingMessage,res:ServerResponse){
      const headers=cors(req);
      const reply=(status:number,body:object)=>{if(!res.headersSent){res.writeHead(status,{...headers,"Content-Type":"application/json"});res.end(JSON.stringify(body));}};
      if(!allowed(req.headers.origin)){reply(403,{code:403,error:"ORIGIN_NOT_ALLOWED"});return;}
      if(req.method==="OPTIONS"){res.writeHead(204,headers);res.end();return;}
      const route=req.url?.match(/^\/matchmake\/(create|joinById|reconnect)\/([a-zA-Z0-9_-]+)$/);
      if(req.method!=="POST"||!route){reply(404,{code:404,error:"NOT_FOUND"});return;}
      let size=0;const chunks:Buffer[]=[];
      try{
        for await(const chunk of req){size+=chunk.length;if(size>8192){reply(413,{code:413,error:"PAYLOAD_TOO_LARGE"});return;}chunks.push(Buffer.from(chunk));}
        const options=JSON.parse(Buffer.concat(chunks).toString());
        const result=await matchMaker.controller.invokeMethod(route[1],route[2],options,{headers:new Headers(req.headers as Record<string,string>),ip:req.socket.remoteAddress??"unknown",req});
        reply(200,result);
      }catch(error){reply(400,{code:400,error:error instanceof Error?error.message:"INVALID_REQUEST"});}
  }
  const server=new Server({greet:false,gracefullyShutdown:false,transport:new WebSocketTransport({
    server:http,maxPayload:8192,pingInterval:5000,pingMaxRetries:2,
    verifyClient:(info:{origin:string})=>allowed(info.origin||undefined),
  })});
  server.define("eightball",createPoolRoom(services));
  http.prependListener("upgrade",stripSocketPrefix);
  let cleanup:NodeJS.Timeout|undefined;let closed=false;
  return {
    services,server,http,
    async listen(){
      await server.listen(config.port,config.host);
      // Own the entire HTTP boundary; Colyseus still owns WebSocket upgrades.
      // Replaces its default HTTP router so every matchmaking route goes through
      // our origin, size and method guards. Covered by real SDK integration tests.
      http.removeAllListeners("request");http.on("request",app);
      cleanup=setInterval(()=>store.cleanup(),3600_000);cleanup.unref();return http.address();},
    async close(){if(closed)return;closed=true;clearInterval(cleanup);await server.gracefullyShutdown(false);await pool.close();},
  };
}
