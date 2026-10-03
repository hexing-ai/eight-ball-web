import test from "node:test";
import assert from "node:assert/strict";
import {Match} from "../server/match.js";
import {simulate} from "../shared/physics.js";
const input={angle:0,power:0.1,spin:0};
function active(){const m=new Match(60_000,60_000,()=>2);m.join(0,"甲");m.join(1,"乙");m.ready(0,0);m.ready(1,0);return m;}
test("ready starts match; non-turn and stale commands rejected",()=>{
  const m=active();assert.equal(m.phase,"aiming");
  assert.throws(()=>m.beginShot(1,m.turnVersion,"a",input,1),/NOT_YOUR_TURN/);
  assert.throws(()=>m.beginShot(0,m.turnVersion-1,"a",input,1),/STALE_TURN/);
});
test("shot retries are idempotent but changed payload with same id is rejected",()=>{
  const m=active(),v=m.turnVersion;
  assert.equal(m.beginShot(0,v,"shot1",input,1).duplicate,false);
  assert.equal(m.beginShot(0,v,"shot1",input,2).duplicate,true);
  assert.throws(()=>m.beginShot(0,v,"shot1",{...input,power:0.4},3),/OPERATION_CONFLICT/);
  assert.throws(()=>m.beginShot(0,v,"shot2",input,3),/NOT_AIMING/);
  m.acceptSimulation(simulate(m.balls,input),10);assert.equal(m.phase,"animating");
  m.tick(60_000);assert.equal(m.phase,"aiming");assert.equal(m.operation(0,"shot1")!.status,"settled");
});
test("scratch free ball placement is server validated and versioned",()=>{
  const m=active();m.tick(60_001);assert.ok(m.ballInHand);
  assert.throws(()=>m.place(1,m.turnVersion,{x:0,y:0},60_002),/INVALID_PLACEMENT/);
  const v=m.turnVersion;m.place(1,v,{x:0.4,y:0.5},60_002);
  assert.equal(m.ballInHand,false);assert.equal(m.turnVersion,v+1);
});
test("disconnect pauses next aiming turn, returns within grace, expired side loses",()=>{
  const m=active();m.setConnected(0,false,10_000);assert.equal(m.deadline,null);
  m.tick(50_000);assert.notEqual(m.phase,"finished");
  m.setConnected(0,true,50_000);assert.equal(m.deadline,100_000);
  m.setConnected(0,false,51_000);m.tick(111_001);assert.equal(m.winner,1);
});
test("both disconnected produces no winner",()=>{
  const m=active();m.setConnected(0,false,100);m.setConnected(1,false,100);
  m.tick(60_101);assert.equal(m.phase,"finished");assert.equal(m.winner,null);
});
test("accepted shot settles despite disconnect, then waits for reconnect",()=>{
  const m=active();m.beginShot(0,m.turnVersion,"x",input,100);
  m.setConnected(1,false,101);m.acceptSimulation(simulate(m.balls,input),102);
  m.tick(10_000);assert.equal(m.phase,"aiming");assert.equal(m.deadline,null);
});
test("both must agree to rematch, next match alternates breaker",()=>{
  const m=active(),id=m.matchId;m.resign(0);m.rematch(0,100);assert.equal(m.phase,"finished");
  m.rematch(1,100);assert.equal(m.phase,"aiming");assert.notEqual(m.matchId,id);assert.equal(m.current,1);
});
test("simulation failure preserves balls and does not duplicate request",()=>{
  const m=active(),before=structuredClone(m.balls);
  m.beginShot(0,m.turnVersion,"bad",input,10);m.failSimulation(20);
  assert.deepEqual(m.balls,before);assert.equal(m.operation(0,"bad")!.status,"failed");assert.equal(m.phase,"aiming");
});
