import test from "node:test";
import assert from "node:assert/strict";
import {rack,ball,simulate,predict,canPlace,TABLE,strike} from "../shared/physics.js";

test("rack has all 16 unique balls, black center and opposite groups at rear corners",()=>{
  const r=rack(42);assert.equal(r.length,16);assert.equal(new Set(r.map(b=>b.id)).size,16);
  assert.deepEqual(r,rack(42));assert.notDeepEqual(r,rack(43));
  const x=r.find(b=>b.id===8)!;assert.ok(Math.abs(x.y-TABLE.height/2)<1e-6);
  for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++)assert.ok(Math.hypot(r[i].x-r[j].x,r[i].y-r[j].y)>2*TABLE.radius);
});
test("simulation is deterministic, settles and does not mutate caller state",()=>{
  const initial=rack(42),copy=structuredClone(initial),shot={angle:0,power:0.65,spin:0};
  const a=simulate(initial,shot),b=simulate(initial,shot);
  assert.deepEqual(a,b);assert.deepEqual(initial,copy);
  assert.ok(a.events.some(e=>e.type==="collision"));assert.ok(a.duration>0&&a.duration<60);
  assert.ok(a.balls.every(b=>b.vx===0&&b.vy===0));
});
test("top and bottom hit points generate opposite spin and follow/draw on short straight shot",()=>{
  const b=ball(0,0.7,0.6);strike(b,{angle:0,power:0.3,spin:1});assert.ok(b.wy>0);
  strike(b,{angle:0,power:0.3,spin:-1});assert.ok(b.wy<0);
  const initial=[ball(0,0.7,0.6),ball(1,0.85,0.6)];
  const high=simulate(initial,{angle:0,power:0.3,spin:1}).balls[0];
  const low=simulate(initial,{angle:0,power:0.3,spin:-1}).balls[0];
  assert.ok(high.x>0.85,"high follows");assert.ok(low.x<0.7,"low draws back");
});
test("guide finds front blocker and agrees with actual target direction",()=>{
  const initial=[ball(0,0.4,0.6),ball(1,0.8,0.62),ball(2,1.3,0.63)];
  const shot={angle:0,power:0.25,spin:-0.5},guide=predict(initial,shot);
  assert.equal(guide.targetId,1);assert.ok(guide.target.length>1);assert.ok(guide.cue.length>1);
  assert.ok(guide.impact);assert.ok(guide.target.at(-1)!.x>guide.target[0].x);
  assert.ok(guide.target.at(-1)!.y>guide.target[0].y);
  const actual=simulate(initial,shot,{frames:true});
  assert.ok(actual.events.some(e=>e.type==="collision"&&e.a===0&&e.b===1));
});
test("no target and wall-first aim never invents a second guide",()=>{
  const guide=predict([ball(0,0.4,0.6),ball(1,1.8,0.9)],{angle:-Math.PI/2,power:0.3,spin:0});
  assert.equal(guide.targetId,null);assert.equal(guide.target.length,0);
  assert.ok(guide.incoming.length>1);
});
test("placement rejects overlaps, pockets, out-of-table and nonfinite coordinates",()=>{
  const r=rack(1);
  assert.ok(canPlace(r,{x:0.5,y:0.5}));
  assert.ok(!canPlace(r,{x:0,y:0}));
  assert.ok(!canPlace(r,{x:NaN,y:0.3}));
  const target=r.find(b=>b.id===1)!;assert.ok(!canPlace(r,target));
});
test("invalid shot cannot enter simulation",()=>{
  for(const power of [-1,0,Infinity,2])assert.throws(()=>simulate(rack(1),{power,angle:0,spin:0}));
  assert.throws(()=>simulate(rack(1),{power:0.5,angle:NaN,spin:0}));
});
test("30 varied shots remain finite and bounded at rest",()=>{
  for(let i=0;i<30;i++){
    const result=simulate(rack(i+1),{angle:(i-15)*0.006,power:0.15+(i%8)*0.1,spin:(i%5-2)/2});
    for(const b of result.balls) {
      assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));
      if(!b.pocketed)assert.ok(b.x>=0&&b.x<=TABLE.width&&b.y>=0&&b.y<=TABLE.height);
    }
  }
});


test("30 guide cases follow sampled authoritative trajectories for both balls",()=>{
  for(let i=0;i<30;i++){
    const initial=[ball(0,0.7,0.63),ball(1,0.87,0.63+(i%5-2)*0.012)];
    const shot={angle:0,power:0.18+(i%3)*0.12,spin:(Math.floor(i/5)%3-1)*0.8};
    const guide=predict(initial,shot);
    const paths=new Map<number,Array<{x:number;y:number}>>([[0,[]],[1,[]]]);
    const result=simulate(initial,shot,{observe:(balls)=>{for(const b of balls)paths.get(b.id)!.push({x:b.x,y:b.y});}});
    assert.ok(result.events.some(e=>e.type==="collision"&&e.a===0&&e.b===1));
    assert.equal(guide.targetId,1);
    for(const [id,path] of [[0,guide.cue],[1,guide.target]] as const){
      assert.ok(path.length>1);
      for(const point of path){
        const error=Math.min(...paths.get(id)!.map(p=>Math.hypot(p.x-point.x,p.y-point.y)));
        assert.ok(error<0.006,`case ${i}, ball ${id}: path error ${error}`);
      }
    }
  }
});
