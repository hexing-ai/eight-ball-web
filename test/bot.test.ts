import test from 'node:test';
import assert from 'node:assert/strict';
import { botTargets, botPlacement, chooseBotShot, type BotPosition } from '../shared/bot.js';
import { ball, canPlace, rack, simulate } from '../shared/physics.js';
import { adjudicate } from '../shared/rules.js';

const position=(balls= rack(5)):BotPosition=>({balls,groups:[null,null],breakShot:false,ballInHand:false});
test('bot respects groups and targets black only after clearing its group',()=>{
 const p=position([ball(0,.5,.5),ball(1,1,.5),ball(8,1.5,.5),ball(9,2,.5)]);
 assert.deepEqual(botTargets(p).map(b=>b.id),[1,9]);p.groups=['stripe','solid'];
 assert.deepEqual(botTargets(p).map(b=>b.id),[1]);p.balls[1].pocketed=true;
 assert.deepEqual(botTargets(p).map(b=>b.id),[8]);
});
test('computer finds and pots a clear legal object ball using actual physics',()=>{
 const p=position([ball(0,1.27,.9),ball(1,1.27,.4),ball(8,2,.8),ball(9,.5,.4)]);p.groups=['stripe','solid'];
 const before=structuredClone(p);const plan=chooseBotShot(p);const result=simulate(p.balls,plan.shot);
 assert.ok(result.events.some(e=>e.type==='pocket'&&e.ball===1));
 const ruling=adjudicate({shooter:1,groups:p.groups,before:p.balls,breakShot:false},result.events);
 assert.equal(ruling.foul,null);assert.equal(ruling.next,1);assert.deepEqual(p,before);
});
test('computer chooses a legal cue placement and can win by potting the last black',()=>{
 const p=position([ball(0,.1,.1),ball(8,1.27,.4),ball(9,.5,.5)]);p.groups=['stripe','solid'];p.ballInHand=true;p.balls[0].pocketed=true;
 assert.ok(canPlace(p.balls,botPlacement(p)));const plan=chooseBotShot(p);assert.ok(plan.position);
 Object.assign(p.balls[0],plan.position,{pocketed:false});
 const result=simulate(p.balls,plan.shot),ruling=adjudicate({shooter:1,groups:p.groups,before:p.balls,breakShot:false},result.events);
 assert.equal(ruling.winner,1);assert.equal(ruling.finished,true);
});
test('computer has a valid break shot and handles blocked layouts without invalid inputs',()=>{
 for(const breaking of [true,false]){const p=position();p.breakShot=breaking;const plan=chooseBotShot(p);assert.ok(plan.shot.power>0&&plan.shot.power<=1);assert.ok(Number.isFinite(plan.shot.angle));assert.doesNotThrow(()=>simulate(p.balls,plan.shot));}
});
