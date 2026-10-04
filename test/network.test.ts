import test from "node:test";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackend } from "../server/app.js";
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function inbox(room:Room){
  const messages:Array<{type:string;data:any}>=[];
  room.onMessage("*",(type,data)=>messages.push({type:String(type),data}));
  return {
    messages,
    async wait(type:string,filter:(data:any)=>boolean=()=>true,timeout=8000):Promise<any>{
      const until=Date.now()+timeout;
      while(Date.now()<until){
        const index=messages.findIndex(m=>m.type===type&&filter(m.data));
        if(index>=0)return messages.splice(index,1)[0].data;
        await delay(10);
      }
      throw new Error("Timed out "+type+"; received "+JSON.stringify(messages.map(m=>({type:m.type,phase:m.data?.phase,code:m.data?.code}))));
    },
  };
}
test("real HTTP/WebSocket invite, rules, idempotency, synchronization, reconnect and rematch",{timeout:25000},async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),"eightball-test-"));
  const staticDir=join(dataDir,"public");mkdirSync(staticDir);
  writeFileSync(join(staticDir,"index.html"),"<!doctype html><title>Eight Ball</title>");
  writeFileSync(join(dataDir,"private-checkpoint.json"),"private");
  const backend=createBackend({port:0,host:"127.0.0.1",origins:["http://localhost:5173"],dataDir,staticDir,workers:2,turnMs:60_000,reconnectMs:2000,waitingMs:60_000,maxRooms:100});
  const clients:Room[]=[];
  try{
    const addr=await backend.listen();assert.ok(addr&&typeof addr!=="string");
    const url="http://127.0.0.1:"+addr.port,sdk=new Client(url+"/socket");
    assert.match(await(await fetch(url+"/")).text(),/<title>Eight Ball<\/title>/);
    assert.equal((await fetch(url+"/private-checkpoint.json")).status,404);
    assert.equal((await fetch(url+"/socket/api/config",{headers:{Origin:"https://untrusted.example"}})).status,403);
    assert.equal((await fetch(url+"/healthz")).status,200);
    assert.equal((await fetch(url+"/api/config",{headers:{Origin:"https://untrusted.example"}})).status,403);
    const forbidden=await fetch(url+"/matchmake/create/eightball",{method:"POST",headers:{Origin:"https://untrusted.example","Content-Type":"application/json"},body:"{}"});
    assert.equal(forbidden.status,403);
    assert.equal(forbidden.headers.get("Access-Control-Allow-Origin"),null);
    const preflight=await fetch(url+"/matchmake/create/eightball",{method:"OPTIONS",headers:{Origin:"http://localhost:5173","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"content-type"}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"),"http://localhost:5173");
    assert.equal(preflight.headers.get("Access-Control-Allow-Credentials"),"true");
    const allowedResponse=await fetch(url+"/api/config",{headers:{Origin:"http://localhost:5173"}});
    assert.equal(allowedResponse.headers.get("Access-Control-Allow-Credentials"),"true");
    const host=await sdk.create("eightball",{nickname:"玩家一",creatorKey:randomUUID(),protocol:1});clients.push(host);
    const a=inbox(host);host.send("command",{type:"sync",requestId:"sync1"});
    const welcome=await a.wait("welcome");
    assert.match(welcome.inviteCode,/^[A-Z2-9]{8}$/);
    const lookup=await(await fetch(url+"/api/rooms/"+welcome.inviteCode)).json() as any;
    assert.equal(lookup.roomId,host.roomId);
    await assert.rejects(sdk.joinById(host.roomId,{nickname:"无邀请",protocol:1}));
    // A guest may leave the waiting room; the invitation remains reusable.
    const visitor=await sdk.joinById(host.roomId,{nickname:"访客",inviteCode:welcome.inviteCode,protocol:1});
    clients.push(visitor);inbox(visitor);
    host.send("command",{type:"ready",requestId:"early-ready"});
    await a.wait("snapshot",s=>s.phase==="waiting"&&s.players[0].ready&&s.players[1]);
    await visitor.leave();
    await a.wait("snapshot",s=>s.phase==="waiting"&&!s.players[1]&&!s.players[0].ready);
    const guest=await sdk.joinById(host.roomId,{nickname:"玩家二",inviteCode:welcome.inviteCode,protocol:1});clients.push(guest);
    const b=inbox(guest);guest.send("command",{type:"sync",requestId:"sync2"});await b.wait("welcome");
    await assert.rejects(sdk.joinById(host.roomId,{nickname:"第三人",inviteCode:welcome.inviteCode,protocol:1}));
    host.send("command",{type:"ready",requestId:"r1"});guest.send("command",{type:"ready",requestId:"r2"});
    const sa=await a.wait("snapshot",s=>s.phase==="aiming"),sb=await b.wait("snapshot",s=>s.phase==="aiming");
    assert.deepEqual(sa.balls,sb.balls);assert.equal(sa.matchId,sb.matchId);
    const current=sa.current===0?host:guest,other=sa.current===0?guest:host;
    const ci=sa.current===0?a:b,oi=sa.current===0?b:a;
    other.send("command",{type:"shot",requestId:"not-turn",turnVersion:sa.turnVersion,shot:{angle:0,power:0.1,spin:0}});
    assert.equal((await oi.wait("error",s=>s.requestId==="not-turn")).code,"NOT_YOUR_TURN");
    current.send("command",{type:"shot",requestId:"invalid",turnVersion:sa.turnVersion,shot:{angle:0,power:2,spin:0}});
    assert.equal((await ci.wait("error",s=>s.code==="INVALID_COMMAND")).code,"INVALID_COMMAND");
    const cmd={type:"shot",requestId:"one-shot",turnVersion:sa.turnVersion,shot:{angle:-Math.PI/2,power:0.06,spin:0}};
    current.send("command",cmd);current.send("command",cmd);
    await ci.wait("ack",s=>s.requestId==="one-shot"&&!s.duplicate);
    assert.equal((await ci.wait("ack",s=>s.requestId==="one-shot"&&s.duplicate)).duplicate,true);
    const shotA=await a.wait("shot"),shotB=await b.wait("shot");assert.deepEqual(shotA,shotB);
    const ea=await a.wait("snapshot",s=>s.phase==="aiming"&&s.turnVersion>sa.turnVersion);
    const eb=await b.wait("snapshot",s=>s.phase==="aiming"&&s.turnVersion>sa.turnVersion);
    assert.deepEqual(ea.balls,eb.balls);assert.ok(ea.ballInHand);
    // Drop transport without a consented leave; reconnect with framework-issued token.
    const token=guest.reconnectionToken;
    guest.connection.close();await a.wait("snapshot",s=>s.matchId===ea.matchId&&s.revision>ea.revision&&s.players[1]?.connected===false);
    const restored=await sdk.reconnect(token);clients.push(restored);
    const c=inbox(restored);restored.send("command",{type:"sync",requestId:"restore"});
    await c.wait("welcome");
    const state=await c.wait("snapshot",s=>s.players.every((p:any)=>p.connected));
    assert.deepEqual(state.balls,ea.balls);assert.equal(state.matchId,ea.matchId);
    restored.send("command",{type:"resign",requestId:"resign"});
    await a.wait("snapshot",s=>s.phase==="finished");await c.wait("snapshot",s=>s.phase==="finished");
    host.send("command",{type:"rematch",requestId:"again1"});restored.send("command",{type:"rematch",requestId:"again2"});
    const newState=await c.wait("snapshot",s=>s.phase==="aiming"&&s.matchId!==sa.matchId);
    assert.equal(newState.current,sa.breaker===0?1:0);
    const oversized=await fetch(url+"/matchmake/create/eightball",{method:"POST",body:JSON.stringify({x:"a".repeat(9000)})});
    assert.equal(oversized.status,413);
    // Graceful restart must persist interruption, never a fabricated victory.
    await backend.close();
    const checkpoint=backend.services.store.read(welcome.inviteCode);
    assert.equal(checkpoint?.state.phase,"finished");
    assert.equal(checkpoint?.state.winner,null);
    assert.equal(checkpoint?.state.reason,"服务重启，本局中断");
  }finally{
    await Promise.all(clients.map(async c=>{if(c.connection.isOpen)await c.leave();}));
    await backend.close();rmSync(dataDir,{recursive:true,force:true});
  }
});
