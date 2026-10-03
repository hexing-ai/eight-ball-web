import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeGame } from '../shared/practice-game.js';
import { simulate } from '../shared/physics.js';
import type { Match } from '../shared/match.js';
import type { Ball, Shot, Simulation } from '../shared/types.js';
type Snapshot=ReturnType<Match['snapshot']>;
const shot={angle:-Math.PI/2,power:.06,spin:0};
function setup(sim:(balls:Ball[],shot:Shot)=>Promise<Simulation>=async(b,s)=>simulate(b,s)){
 let now=1000,state!:Snapshot;const errors:string[]=[];
 const game=new PracticeGame(sim,s=>state=s,e=>errors.push(e),()=>now);
 game.start();return {game,errors,get state(){return state;},advance(ms:number){now+=ms;game.tick();},fire(){return game.send({type:'shot',requestId:'shot',turnVersion:state.turnVersion,shot});}};
}
test('solo practice has one player, no timer, no foul turn changes and uses real physics',async()=>{
 const t=setup();assert.equal(t.state.players[1],null);assert.equal(t.state.deadline,null);
 t.advance(3600000);assert.equal(t.state.phase,'aiming');assert.equal(t.state.ballInHand,false);
 await t.fire();assert.equal(t.state.phase,'animating');assert.ok(t.state.activeShot!.duration>0);
 t.advance(t.state.activeShot!.duration*1000+1);
 assert.equal(t.state.phase,'aiming');assert.equal(t.state.current,0);assert.equal(t.state.winner,null);
 assert.equal(t.state.ballInHand,false);assert.deepEqual(t.errors,[]);
});
test('scratch restores placement, early black is allowed and all targets completes practice',async()=>{
 let clear=false;
 const t=setup(async balls=>({balls:balls.map(b=>({...b,pocketed:clear||b.id===0||b.id===8})),events:[],frames:[],duration:1}));
 await t.fire();t.advance(1001);assert.equal(t.state.phase,'aiming');assert.equal(t.state.ballInHand,true);
 await t.game.send({type:'shot',requestId:'blocked',turnVersion:t.state.turnVersion,shot});assert.equal(t.errors.pop(),'PLACE_CUE_FIRST');
 await t.game.send({type:'place',turnVersion:t.state.turnVersion,position:{x:.4,y:.5}});
 assert.equal(t.state.balls[0].pocketed,false);assert.equal(t.state.ballInHand,false);
 clear=true;await t.fire();t.advance(1001);assert.equal(t.state.phase,'finished');assert.equal(t.state.winner,null);
 const id=t.state.matchId;await t.game.send({type:'rematch'});assert.notEqual(t.state.matchId,id);assert.equal(t.state.phase,'aiming');assert.equal(t.state.balls.filter(b=>b.pocketed).length,0);
});
test('free placement validates overlap and stale turns, and is locked during motion',async()=>{
 const t=setup();await t.game.send({type:'practice-place',turnVersion:t.state.turnVersion});assert.equal(t.state.ballInHand,true);
 await t.game.send({type:'place',turnVersion:t.state.turnVersion,position:{x:-1,y:0}});assert.equal(t.errors.pop(),'INVALID_PLACEMENT');
 const target=t.state.balls.find(b=>b.id===1)!;
 await t.game.send({type:'place',turnVersion:t.state.turnVersion,position:target});assert.equal(t.errors.pop(),'INVALID_PLACEMENT');
 await t.game.send({type:'place',turnVersion:0,position:{x:.4,y:.5}});assert.equal(t.errors.pop(),'STALE_TURN');
 await t.game.send({type:'place',turnVersion:t.state.turnVersion,position:{x:.4,y:.5}});await t.fire();
 await t.game.send({type:'practice-place',turnVersion:t.state.turnVersion});assert.equal(t.errors.pop(),'NOT_AIMING');assert.equal(t.state.phase,'animating');
});
test('restart and exit discard pending practice simulations; failed simulation can retry',async()=>{
 let resolve!:(s:Simulation)=>void;
 const t=setup(()=>new Promise(r=>resolve=r));const initial=t.state;
 const pending=t.fire();await t.game.send({type:'practice-place',turnVersion:t.state.turnVersion});assert.equal(t.errors.pop(),'NOT_AIMING');assert.equal(t.state.phase,'simulating');t.game.start();const fresh=t.state.matchId;
 resolve(simulate(initial.balls,shot));await pending;assert.equal(t.state.matchId,fresh);assert.equal(t.state.phase,'aiming');
 const pending2=t.fire();t.game.stop();const stopped=t.state;
 resolve(simulate(initial.balls,shot));await pending2;assert.equal(t.state,stopped);
 const f=setup(async()=>{throw new Error('SIMULATION_FAILED');});await f.fire();assert.equal(f.state.phase,'aiming');assert.equal(f.state.activeShot,null);assert.deepEqual(f.errors,['SIMULATION_FAILED']);
});
