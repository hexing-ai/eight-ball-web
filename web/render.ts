import { trimPath, GUIDE_LENGTH } from '../shared/guide-display.js';
import { TABLE, POCKETS } from '../shared/physics.js';
import type { Ball, Guide, Vec } from '../shared/types.js';
export const COLORS=['#f3efdf','#e9ae15','#245bb9','#bd272c','#743b95','#df7428','#227c50','#782c30','#10171e'];
export type RenderBall=Pick<Ball,'id'|'x'|'y'|'pocketed'>;
export interface Scene {balls:RenderBall[];angle:number;power:number;guide:Guide|null;showCue:boolean;placement:Vec|null;placementValid:boolean;motion:number}
const PAD=.16,W=TABLE.width,H=TABLE.height,R=TABLE.radius;
export class TableRenderer {
  private ctx:CanvasRenderingContext2D;
  private background=document.createElement('canvas');
  private width=0;private height=0;private dpr=1;
  scale=1;ox=0;oy=0;
  private sprites=new Map<number,HTMLCanvasElement>();
  constructor(readonly canvas:HTMLCanvasElement){this.ctx=canvas.getContext('2d')!;}
  resize(){
    const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    const width=Math.round(rect.width),height=Math.round(rect.height);
    if(width===this.width&&height===this.height&&dpr===this.dpr)return;
    this.width=width;this.height=height;this.dpr=dpr;
    this.canvas.width=Math.max(1,Math.round(width*dpr));this.canvas.height=Math.max(1,Math.round(height*dpr));
    this.scale=Math.min(width/(W+PAD*2),height/(H+PAD*2));
    this.ox=(width-W*this.scale)/2;this.oy=(height-H*this.scale)/2;
    this.background.width=this.canvas.width;this.background.height=this.canvas.height;
    this.paintTable();this.sprites.clear();
  }
  point(clientX:number,clientY:number):Vec{const r=this.canvas.getBoundingClientRect();return{x:(clientX-r.left-this.ox)/this.scale,y:(clientY-r.top-this.oy)/this.scale};}
  private world(ctx:CanvasRenderingContext2D){ctx.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,this.dpr*this.ox,this.dpr*this.oy);}
  private paintTable(){
    const c=this.background.getContext('2d')!;this.world(c);
    const round=(x:number,y:number,w:number,h:number,r:number)=>{c.beginPath();c.roundRect(x,y,w,h,r);};
    // Original procedural walnut: a repeatable grain, not copied game artwork.
    c.shadowColor='#000b';c.shadowBlur=20*this.dpr;c.shadowOffsetY=9*this.dpr;
    const wood=c.createLinearGradient(0,-.13,0,H+.13);wood.addColorStop(0,'#815638');wood.addColorStop(.07,'#422d24');wood.addColorStop(.5,'#64412e');wood.addColorStop(1,'#38271f');
    c.fillStyle=wood;round(-.123,-.123,W+.246,H+.246,.085);c.fill();c.shadowColor='transparent';
    c.save();round(-.12,-.12,W+.24,H+.24,.08);c.clip();
    let seed=173;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<420;i++){
      const y=-.12+rand()*(H+.24);c.beginPath();c.moveTo(-.13,y);c.bezierCurveTo(W*.3,y+(rand()-.5)*.018,W*.7,y+(rand()-.5)*.018,W+.13,y);
      c.strokeStyle=i%3===0?'#d2a36a17':'#100b072b';c.lineWidth=.0004+rand()*.0013;c.stroke();
    }c.restore();
    round(-.123,-.123,W+.246,H+.246,.085);c.strokeStyle='#d9b67a';c.lineWidth=.004;c.stroke();
    round(-.11,-.11,W+.22,H+.22,.073);c.strokeStyle='#ffffff17';c.lineWidth=.0015;c.stroke();
    const felt=c.createRadialGradient(W*.43,H*.35,.01,W*.5,H*.5,W*.65);felt.addColorStop(0,'#27964a');felt.addColorStop(.6,'#1e823b');felt.addColorStop(1,'#135c2b');c.fillStyle=felt;c.fillRect(-.012,-.012,W+.024,H+.024);
    // Very fine baize fibers use fixed noise and stay cached between frames.
    for(let i=0;i<18000;i++){const x=rand()*W,y=rand()*H;c.fillStyle=i%2?'#cce0ac0c':'#001d170b';c.fillRect(x,y,.001,.002);}
    const cushion=(points:number[][],vertical:boolean)=>{
      c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();
      const g=c.createLinearGradient(vertical?points[0][0]:0,vertical?0:points[0][1],vertical?points[2][0]:0,vertical?0:points[2][1]);g.addColorStop(0,'#34914b');g.addColorStop(.45,'#238640');g.addColorStop(1,'#145f2b');c.fillStyle=g;c.fill();c.strokeStyle='#6cba7533';c.lineWidth=.002;c.stroke();
    };
    const p=.064,m=W/2;
    cushion([[p,-.045],[m-p,-.045],[m-p-.012,0],[p+.018,0]],false);
    cushion([[m+p,-.045],[W-p,-.045],[W-p-.018,0],[m+p+.012,0]],false);
    cushion([[p,H+.045],[m-p,H+.045],[m-p-.012,H],[p+.018,H]],false);
    cushion([[m+p,H+.045],[W-p,H+.045],[W-p-.018,H],[m+p+.012,H]],false);
    cushion([[-.045,p],[-.045,H-p],[0,H-p-.018],[0,p+.018]],true);
    cushion([[W+.045,p],[W+.045,H-p],[W,H-p-.018],[W,p+.018]],true);
    // Inner contact shadows keep the playfield grounded.
    c.save();c.beginPath();c.rect(0,0,W,H);c.clip();c.strokeStyle='#03251075';c.lineWidth=.012;c.shadowColor='#00150077';c.shadowBlur=7*this.dpr;c.strokeRect(-.001,-.001,W+.002,H+.002);c.restore();
    for(const pocket of POCKETS){
      const r=.066;c.beginPath();c.arc(pocket.x,pocket.y,r+.012,0,Math.PI*2);const metal=c.createLinearGradient(pocket.x-r,pocket.y-r,pocket.x+r,pocket.y+r);metal.addColorStop(0,'#f5d9a1');metal.addColorStop(.45,'#94713f');metal.addColorStop(1,'#4e371d');c.fillStyle=metal;c.fill();
      c.beginPath();c.arc(pocket.x,pocket.y,r,0,Math.PI*2);c.fillStyle='#060c0b';c.fill();c.strokeStyle='#181912';c.lineWidth=.003;c.stroke();
      const well=c.createRadialGradient(pocket.x,pocket.y+.023,.001,pocket.x,pocket.y,r);well.addColorStop(0,'#000');well.addColorStop(.75,'#050a08');well.addColorStop(1,'#263327');c.fillStyle=well;c.fill();
    }
    const diamond=(x:number,y:number)=>{c.beginPath();c.moveTo(x,y-.009);c.lineTo(x+.0045,y);c.lineTo(x,y+.009);c.lineTo(x-.0045,y);c.closePath();c.fillStyle='#d5b677';c.fill();c.strokeStyle='#ffe7b37a';c.lineWidth=.001;c.stroke();};
    for(const t of [.125,.25,.375,.625,.75,.875]){diamond(W*t,-.082);diamond(W*t,H+.082);}for(const t of [.25,.5,.75]){diamond(-.081,H*t);diamond(W+.081,H*t);}
    c.fillStyle='#e4c38999';c.font='.014px Georgia';c.textAlign='center';c.fillText('E I G H T   B A L L',W/2,H+.098);
    c.globalAlpha=.25;c.strokeStyle='#dae9b5';c.lineWidth=.001;c.beginPath();c.arc(W*.25,H*.5,.004,0,Math.PI*2);c.stroke();c.globalAlpha=1;
  }
  private sprite(id:number){
    if(this.sprites.has(id))return this.sprites.get(id)!;
    const s=document.createElement('canvas');s.width=s.height=128;const c=s.getContext('2d')!;const r=45,x=64,y=59;
    c.shadowColor='#0009';c.shadowBlur=9;c.shadowOffsetY=7;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle='#fff';c.fill();c.shadowColor='transparent';
    c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.clip();
    c.fillStyle=id>8?'#e8e4d8':COLORS[id];c.fillRect(0,0,128,128);
    if(id>8){c.save();c.translate(x,y);c.rotate(-.2);c.fillStyle=COLORS[id-8];c.fillRect(-r,-r*.55,r*2,r*1.1);c.restore();}
    const shade=c.createRadialGradient(x-r*.4,y-r*.5,1,x,y,r);shade.addColorStop(0,'#ffffff65');shade.addColorStop(.35,'#ffffff00');shade.addColorStop(.7,'#0000000a');shade.addColorStop(1,'#000000a0');c.fillStyle=shade;c.fillRect(0,0,128,128);
    if(id){c.beginPath();c.arc(x,y,18,0,Math.PI*2);c.fillStyle='#faf5e6';c.fill();c.fillStyle='#151b20';c.textAlign='center';c.textBaseline='middle';c.font=`700 ${id>9?21:25}px Arial`;c.fillText(String(id),x,y+1);}
    c.beginPath();c.ellipse(x-15,y-25,14,7,-.4,0,Math.PI*2);c.fillStyle='#ffffffa5';c.fill();c.restore();this.sprites.set(id,s);return s;
  }
  private drawBall(c:CanvasRenderingContext2D,b:RenderBall){const size=R*128/45;c.drawImage(this.sprite(b.id),b.x-size/2,b.y-size*59/128,size,size);}
  private path(c:CanvasRenderingContext2D,points:Vec[],color:string,dashed=false,arrow=false){
    if(points.length<2)return;c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=color;c.lineWidth=.003;c.setLineDash(dashed?[.012,.009]:[]);c.stroke();c.setLineDash([]);
    if(arrow){const a=points.at(-2)!,b=points.at(-1)!,angle=Math.atan2(b.y-a.y,b.x-a.x);c.save();c.translate(b.x,b.y);c.rotate(angle);c.beginPath();c.moveTo(-.015,-.008);c.lineTo(0,0);c.lineTo(-.015,.008);c.strokeStyle=color;c.lineWidth=.004;c.stroke();c.restore();}
  }
  draw(scene:Scene){
    const c=this.ctx;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.canvas.width,this.canvas.height);c.drawImage(this.background,0,0);this.world(c);
    if(scene.guide){const g=scene.guide;this.path(c,trimPath(g.incoming,GUIDE_LENGTH.incoming),'#f7f4dfc9');this.path(c,trimPath(g.target,GUIDE_LENGTH.target),'#ffce4c',false,true);this.path(c,trimPath(g.cue,GUIDE_LENGTH.cue),'#8cdceb',true,true);if(g.impact){c.beginPath();c.arc(g.impact.x,g.impact.y,R,0,Math.PI*2);c.strokeStyle='#fffde29c';c.lineWidth=.002;c.fillStyle='#e9ffe11a';c.fill();c.stroke();if(g.cueStops){c.beginPath();c.arc(g.impact.x,g.impact.y,.006,0,Math.PI*2);c.fillStyle='#8cdceb';c.fill();}}}
    for(const b of scene.balls)if(!b.pocketed)this.drawBall(c,b);
    const cue=scene.balls.find(b=>b.id===0);
    if(scene.showCue&&cue&&!cue.pocketed){
      c.save();c.translate(cue.x,cue.y);c.rotate(scene.angle);const pull=.05+scene.power*.1;
      c.shadowColor='#0007';c.shadowBlur=3*this.dpr;c.shadowOffsetY=4*this.dpr;
      const g=c.createLinearGradient(0,-.01,0,.01);g.addColorStop(0,'#f8dab1');g.addColorStop(.5,'#c9995e');g.addColorStop(1,'#7b4b2b');c.fillStyle=g;c.beginPath();c.moveTo(-R-pull,-.004);c.lineTo(-.87-pull,-.012);c.lineTo(-.87-pull,.012);c.lineTo(-R-pull,.004);c.closePath();c.fill();c.shadowColor='transparent';
      c.fillStyle='#dedbba';c.fillRect(-R-pull-.018,-.0045,.016,.009);c.fillStyle='#65959b';c.fillRect(-R-pull-.003,-.0045,.006,.009);
      c.fillStyle='#151c1e';c.fillRect(-.86-pull,-.011,.26,.022);for(const x of [-.85,-.82,-.62]){c.fillStyle='#ba934f';c.fillRect(x-pull,-.011,.004,.022);}c.restore();
    }
    if(scene.placement){const p=scene.placement;c.save();c.globalAlpha=.8;this.drawBall(c,{...p,id:0,pocketed:false});c.globalAlpha=1;c.beginPath();c.arc(p.x,p.y,R+.012,0,Math.PI*2);c.strokeStyle=scene.placementValid?'#d8e8ba':'#ff8c77';c.lineWidth=.003;c.setLineDash([.01,.007]);c.stroke();c.setLineDash([]);c.restore();}
  }
}
