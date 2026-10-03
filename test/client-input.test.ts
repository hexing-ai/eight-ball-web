import test from 'node:test';
import assert from 'node:assert/strict';
import { Charge } from '../shared/client-input.js';
test('charge is elapsed-time based and key repeat cannot restart it',()=>{
  const a=new Charge(),b=new Charge();a.begin('keyboard',0);b.begin('keyboard',0);
  for(let t=0;t<900;t+=1000/60)a.tick(t);for(let t=0;t<900;t+=1000/120)b.tick(t);
  assert.equal(a.begin('keyboard',800),false);assert.equal(a.release('keyboard',900),.6);assert.equal(b.release('keyboard',900),.6);
  assert.equal(a.release('keyboard',901),null);
});
test('blur/cancel never shoots and a second pointer cannot change or release power',()=>{
  const charge=new Charge();charge.begin('pointer-1',0);charge.drag('pointer-1',60,100);charge.drag('pointer-2',100,100);
  assert.equal(charge.power,.6);assert.equal(charge.release('pointer-2',100),null);
  charge.cancel();assert.equal(charge.release('pointer-1',101),null);
  charge.begin('pointer-1',0);charge.drag('pointer-1',0,100);assert.equal(charge.release('pointer-1',1),null);
});
