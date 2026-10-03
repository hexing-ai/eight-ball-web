import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalGame } from '../shared/local-game.js';
import { simulate } from '../shared/physics.js';
import type { Match } from '../shared/match.js';
import type { Simulation } from '../shared/types.js';
type Snapshot=ReturnType<Match['snapshot']>;

test('Pages demo plays a real shot, switches player, places a free ball and rematches',async()=>{
  let now=1000,state:Snapshot|undefined;const errors:string[]=[];
  const game=new LocalGame(async(balls,shot)=>simulate(balls,shot),s=>state=s,e=>errors.push(e),()=>now);
  game.start();const initial=state!;assert.equal(initial.phase,'aiming');
  await game.send({type:'shot',requestId:'demo-shot',turnVersion:initial.turnVersion,shot:{angle:-Math.PI/2,power:.06,spin:0}});
  assert.equal(state!.phase,'animating');assert.ok(state!.activeShot!.duration>0);
  now+=state!.activeShot!.duration*1000+1;game.tick();
  assert.equal(state!.phase,'aiming');assert.notEqual(state!.current,initial.current);assert.equal(state!.ballInHand,true);
  await game.send({type:'place',turnVersion:state!.turnVersion,position:{x:.4,y:.5}});
  assert.equal(state!.ballInHand,false);
  await game.send({type:'resign'});assert.equal(state!.phase,'finished');
  await game.send({type:'rematch'});assert.equal(state!.phase,'aiming');assert.notEqual(state!.matchId,initial.matchId);
  assert.deepEqual(errors,[]);game.stop();
});

test('reset and leaving discard in-flight demo simulation results',async()=>{
  let state:Snapshot|undefined,resolve!:(s:Simulation)=>void;
  const game=new LocalGame(()=>new Promise(r=>resolve=r),s=>state=s,()=>{},()=>1000);
  game.start();const initial=state!;
  const shot={angle:0,power:.2,spin:0};
  const pending=game.send({type:'shot',requestId:'stale-demo-shot',turnVersion:initial.turnVersion,shot});
  assert.equal(state!.phase,'simulating');game.start();const fresh=state!.matchId;
  resolve(simulate(initial.balls,shot));await pending;
  assert.equal(state!.matchId,fresh);assert.equal(state!.phase,'aiming');
  game.stop();await game.send({type:'resign'});assert.equal(state!.phase,'aiming');
});
