import test from 'node:test';
import assert from 'node:assert/strict';
import { BotGame } from '../shared/bot-game.js';
import { chooseBotShot, type BotPlan } from '../shared/bot.js';
import { simulate } from '../shared/physics.js';
import type { Match } from '../shared/match.js';
import type { Simulation } from '../shared/types.js';
type Snapshot=ReturnType<Match['snapshot']>;
const shot={angle:-Math.PI/2,power:.06,spin:0};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('human shot hands play to the computer, which places free cue and plays automatically',async()=>{
 let now=1000,state!:Snapshot,thinking=0;const errors:string[]=[];
 const game=new BotGame(async(b,s)=>simulate(b,s),async s=>{thinking++;return chooseBotShot(s);},s=>state=s,e=>errors.push(e),()=>{},()=>now);
 game.start();assert.equal(state.current,0);assert.equal(state.players[1]!.name,'电脑');
 await game.send({type:'shot',turnVersion:state.turnVersion,requestId:'human',shot});assert.equal(state.phase,'animating');
 now+=state.activeShot!.duration*1000+1;game.tick();assert.equal(state.current,1);assert.equal(state.ballInHand,true);
 await game.send({type:'shot',turnVersion:state.turnVersion,requestId:'intruder',shot});assert.equal(errors.pop(),'NOT_YOUR_TURN');
 now+=800;game.tick();game.tick();await flush();assert.equal(thinking,1);
 now+=600;game.tick();await flush();assert.equal(state.phase,'animating');assert.equal(state.activeShot!.shooter,1);assert.equal(state.ballInHand,false);
 assert.deepEqual(errors,[]);game.stop();
});
test('late computer decisions are discarded on reset, resign and exit',async()=>{
 for(const action of ['reset','resign','exit']){
  let now=1000,state!:Snapshot,resolve!:(p:BotPlan)=>void;
  const game=new BotGame(async(b,s)=>simulate(b,s),()=>new Promise(r=>resolve=r),s=>state=s,()=>{},()=>{},()=>now);
  game.start();now+=61000;game.tick();now+=800;game.tick();
  assert.equal(state.current,1);
  if(action==='reset')game.start();else if(action==='resign')await game.send({type:'resign'});else game.stop();
  const expected=structuredClone(state);resolve({position:{x:.4,y:.4},shot});await flush();now+=1000;game.tick();await flush();
  assert.equal(state.matchId,expected.matchId);assert.equal(state.phase,expected.phase);assert.equal(state.current,expected.current);assert.equal(state.activeShot,null);game.stop();
 }
});
test('human cannot disturb a running simulation; resignation and rematch use human seat',async()=>{
 let now=1000,state!:Snapshot,resolve!:(s:Simulation)=>void;
 const game=new BotGame(()=>new Promise(r=>resolve=r),async s=>chooseBotShot(s),s=>state=s,()=>{},()=>{},()=>now);
 game.start();const before=state.balls;
 const pending=game.send({type:'shot',turnVersion:state.turnVersion,requestId:'pending',shot});
 await game.send({type:'place',turnVersion:state.turnVersion,position:{x:.3,y:.3}});assert.equal(state.phase,'simulating');
 await game.send({type:'resign'});assert.equal(state.phase,'finished');assert.equal(state.winner,1);
 resolve(simulate(before,shot));await pending;assert.equal(state.phase,'finished');
 const id=state.matchId;await game.send({type:'rematch'});assert.notEqual(state.matchId,id);assert.equal(state.current,1);game.stop();
});
test('computer search failure ends cleanly and allows a new match',async()=>{
 let now=1000,state!:Snapshot;
 const game=new BotGame(async(b,s)=>simulate(b,s),async()=>{throw Error('failed');},s=>state=s,()=>{},()=>{},()=>now);
 game.start();now+=61000;game.tick();now+=800;game.tick();await flush();
 assert.equal(state.phase,'finished');assert.equal(state.winner,null);await game.send({type:'rematch'});assert.equal(state.phase,'aiming');game.stop();
});
