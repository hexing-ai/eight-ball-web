import test from 'node:test';
import assert from 'node:assert/strict';
import { trimPath,GUIDE_LENGTH } from '../shared/guide-display.js';
import { impactSamples,type SoundKind } from '../shared/impact-sound.js';
import { simulate,ball } from '../shared/physics.js';

test('short hints clip total curved travel and never extend or mutate the physical path',()=>{
 const points=[{x:0,y:0},{x:0,y:.1},{x:0,y:.1},{x:.3,y:.1}];
 const copy=structuredClone(points);
 assert.deepEqual(trimPath(points,.2),[{x:0,y:0},{x:0,y:.1},{x:.1,y:.1}]);
 assert.deepEqual(points,copy);
 assert.deepEqual(trimPath([{x:1,y:1},{x:1.01,y:1}],.2),[{x:1,y:1},{x:1.01,y:1}]);
 assert.deepEqual(trimPath([],1),[]);
 for(const cap of Object.values(GUIDE_LENGTH)){
   const path=trimPath([{x:0,y:0},{x:3,y:4}],cap);
   assert.ok(Math.abs(Math.hypot(path[1].x,path[1].y)-cap)<1e-9);
 }
});
test('impact samples remain finite, unclipped and settle to silence at common sample rates',()=>{
 for(const rate of [44100,48000])for(const kind of ['cue','collision','cushion','pocket','turn'] as SoundKind[]){
   const samples=impactSamples(kind,rate);
   assert.ok(samples.every(v=>Number.isFinite(v)&&Math.abs(v)<1));
   assert.ok(samples.some(v=>Math.abs(v)>.02));
   assert.ok(Math.abs(samples.at(-1)!)<.001);
   assert.notDeepEqual(samples,impactSamples(kind,rate,2));
 }
});
test('physical contacts carry nonnegative speed for sound dynamics',()=>{
 const result=simulate([ball(0,.5,.5),ball(1,.9,.5)],{angle:0,power:.7,spin:0});
 assert.ok(result.events.some(e=>e.type==='collision'));
 assert.ok(result.events.some(e=>e.type==='cushion'));
 assert.ok(result.events.every(e=>Number.isFinite(e.speed)&&e.speed!>=0));
});
