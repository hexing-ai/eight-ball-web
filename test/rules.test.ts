import test from "node:test";
import assert from "node:assert/strict";
import {adjudicate,type RuleContext} from "../shared/rules.js";
import {rack} from "../shared/physics.js";
import type {PhysicsEvent} from "../shared/types.js";
const hit=(id:number):PhysicsEvent=>({type:"collision",t:0.1,a:0,b:id});
const pot=(id:number):PhysicsEvent=>({type:"pocket",t:0.5,ball:id,pocket:0});
const rail=(id:number):PhysicsEvent=>({type:"cushion",t:0.3,ball:id});
const ctx=():RuleContext=>({shooter:0,groups:["solid","stripe"],breakShot:false,before:rack(1)});
test("wrong group, scratch, no hit and no rail are fouls",()=>{
  for(const events of [[hit(9),rail(9)],[hit(1),pot(0)],[],[hit(1)]]){
    const r=adjudicate(ctx(),events);assert.ok(r.foul);assert.ok(r.ballInHand);assert.equal(r.next,1);
  }
});
test("rail before first contact does not satisfy post-contact requirement",()=>{
  assert.ok(adjudicate(ctx(),[{type:"cushion",t:0.01,ball:0},hit(1)]).foul);
});
test("legal own pot continues and mixed group pot is not automatically a foul",()=>{
  for(const events of [[hit(1),pot(1)],[hit(1),pot(1),pot(9)]]){
    const r=adjudicate(ctx(),events);assert.equal(r.foul,null);assert.equal(r.next,0);
  }
  const onlyOther=adjudicate(ctx(),[hit(1),pot(9)]);assert.equal(onlyOther.foul,null);assert.equal(onlyOther.next,1);
});
test("open table assigns one group, stays open when both groups are potted",()=>{
  const c=ctx();c.groups=[null,null];
  assert.deepEqual(adjudicate(c,[hit(9),pot(9)]).groups,["stripe","solid"]);
  assert.deepEqual(adjudicate(c,[hit(1),pot(1),pot(9)]).groups,[null,null]);
  assert.ok(adjudicate(c,[hit(8),rail(8)]).foul);
});
test("black eight is a win only with own group clear before the shot",()=>{
  const c=ctx();
  assert.equal(adjudicate(c,[hit(8),pot(8)]).winner,1);
  c.before.forEach(b=>{if(b.id>=1&&b.id<=7)b.pocketed=true;});
  const win=adjudicate(c,[hit(8),pot(8)]);assert.equal(win.winner,0);assert.ok(win.finished);
  assert.equal(adjudicate(c,[hit(8),pot(8),pot(0)]).winner,1);
  const scratch=adjudicate(c,[hit(8),pot(0)]);assert.equal(scratch.finished,false);assert.ok(scratch.ballInHand);
  c.before.find(b=>b.id===7)!.pocketed=false;
  assert.equal(adjudicate(c,[hit(7),pot(7),pot(8)]).winner,1);
});
test("break rules count DISTINCT object ball rails and never assign groups",()=>{
  const c=ctx();c.breakShot=true;c.groups=[null,null];
  assert.ok(adjudicate(c,[hit(1),rail(1),rail(1),rail(1),rail(1)]).foul);
  assert.equal(adjudicate(c,[hit(1),rail(1),rail(2),rail(3),rail(4)]).foul,null);
  assert.deepEqual(adjudicate(c,[hit(1),pot(1)]).groups,[null,null]);
  const r=adjudicate(c,[hit(1),pot(8)]);assert.ok(r.rerack);assert.equal(r.next,0);
  const f=adjudicate(c,[hit(1),pot(8),pot(0)]);assert.ok(f.rerack);assert.equal(f.next,1);
});
