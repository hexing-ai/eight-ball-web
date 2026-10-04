import test from 'node:test';
import assert from 'node:assert/strict';
import { trimPath,GUIDE_LENGTH } from '../shared/guide-display.js';
import { decodePcmWave } from '../shared/audio-samples.js';
import { readFileSync } from 'node:fs';
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
test('bundled real recordings decode without clipping or leading silence',()=>{
 for(const name of ['cue-1','cue-2','cue-3','collision','cushion','pocket']){
   const {rate,samples}=decodePcmWave(readFileSync(`web/assets/audio/${name}.wav`));
   assert.ok(samples.length/rate>=.1&&samples.length/rate<.6);
   assert.ok(samples.every(v=>Number.isFinite(v)&&Math.abs(v)<.8));
   assert.ok(samples.slice(0,rate*.06).some(v=>Math.abs(v)>.025));
   assert.equal(samples[0],0);assert.equal(samples.at(-1),0);
 }
 assert.throws(()=>decodePcmWave(new Uint8Array(44)));
 const clip=readFileSync('web/assets/audio/collision.wav');
 assert.throws(()=>decodePcmWave(clip.subarray(0,clip.length-1)));
});
test('physical contacts carry nonnegative speed for sound dynamics',()=>{
 const result=simulate([ball(0,.5,.5),ball(1,.9,.5)],{angle:0,power:.7,spin:0});
 assert.ok(result.events.some(e=>e.type==='collision'));
 assert.ok(result.events.some(e=>e.type==='cushion'));
 assert.ok(result.events.every(e=>Number.isFinite(e.speed)&&e.speed!>=0));
});
