import type { Ball, Shot, Simulation, PhysicsEvent, Vec, Guide } from "./types.js";

export const TABLE = Object.freeze({ width: 2.54, height: 1.27, radius: 0.028575, pocketRadius: 0.061 });
export const DT = 1 / 480;
const R = TABLE.radius, G = 9.81, SLIDE = 0.20, ROLL = 0.018, STOP = 0.008;
export const POCKETS: Vec[] = [
  { x: 0, y: 0 }, { x: TABLE.width / 2, y: 0 }, { x: TABLE.width, y: 0 },
  { x: 0, y: TABLE.height }, { x: TABLE.width / 2, y: TABLE.height }, { x: TABLE.width, y: TABLE.height },
];
export function ball(id: number, x: number, y: number): Ball {
  return { id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, pocketed: false };
}
export function rack(seed: number): Ball[] {
  let state = seed >>> 0 || 1;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const ids = Array.from({ length: 15 }, (_, i) => i + 1).filter(i => ![1, 8, 9].includes(i));
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const result = [ball(0, TABLE.width * 0.25, TABLE.height / 2)];
  let k = 0;
  const spacing = 2 * R + 0.00015;
  for (let row = 0; row < 5; row++) for (let col = 0; col <= row; col++) {
    const id = row === 2 && col === 1 ? 8 : row === 4 && col === 0 ? 1 : row === 4 && col === 4 ? 9 : ids[k++];
    result.push(ball(id, TABLE.width * 0.72 + row * spacing * Math.sqrt(3) / 2, TABLE.height / 2 + (col - row / 2) * spacing));
  }
  return result.sort((a, b) => a.id - b.id);
}

/**
 * Reduced planar, centered-horizontal-contact adaptation of pooltool cue_strike.
 * Upstream 81040e9, Apache-2.0; see licenses/ and THIRD_PARTY_NOTICES.md.
 * Changes: scalar TS equations, theta=0, no squirt/side spin, UI power -> cue speed.
 */
export function strike(cue: Ball, shot: Shot): void {
  const b = shot.spin * 0.8;
  const speed = 2 * (shot.power * 6.5) / (1 + 0.17 / 0.54 + 2.5 * b * b);
  const x = Math.cos(shot.angle), y = Math.sin(shot.angle);
  cue.vx = speed * x; cue.vy = speed * y;
  cue.wx = -y * speed / R * 2.5 * b;
  cue.wy = x * speed / R * 2.5 * b;
}
function friction(b: Ball) {
  const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
  const slip = Math.hypot(ux, uy);
  let remaining = DT;
  if (slip > 1e-8) {
    const t = Math.min(DT, slip / (3.5 * SLIDE * G));
    const impulse = SLIDE * G * t;
    b.vx -= impulse * ux / slip; b.vy -= impulse * uy / slip;
    b.wx -= 2.5 * impulse * uy / (R * slip);
    b.wy += 2.5 * impulse * ux / (R * slip);
    remaining -= t;
  }
  if (remaining > 1e-10) {
    const v = Math.hypot(b.vx, b.vy);
    const f = v > 0 ? Math.max(0, 1 - ROLL * G * remaining / v) : 0;
    b.vx *= f; b.vy *= f;
    b.wx = -b.vy / R; b.wy = b.vx / R;
  }
  if (Math.hypot(b.vx, b.vy) < STOP && Math.hypot(b.wx, b.wy) * R < STOP) {
    b.vx = b.vy = b.wx = b.wy = 0;
  }
}
function moving(b: Ball) { return !b.pocketed && (Math.hypot(b.vx, b.vy) > 0 || Math.hypot(b.wx, b.wy) > 0); }
function validate(balls: Ball[], shot: Shot) {
  if (![shot.angle, shot.power, shot.spin].every(Number.isFinite) || shot.power <= 0 || shot.power > 1 || Math.abs(shot.spin) > 1) throw new Error("INVALID_SHOT");
  if (balls.length < 1 || balls.length > 16 || new Set(balls.map(b => b.id)).size !== balls.length) throw new Error("INVALID_BALLS");
  if (!balls.some(b => b.id === 0 && !b.pocketed)) throw new Error("NO_CUE");
  for (const b of balls) {
    if (![b.x,b.y,b.vx,b.vy,b.wx,b.wy].every(Number.isFinite) || b.id < 0 || b.id > 15) throw new Error("INVALID_BALL");
    if (!b.pocketed && (b.x < 0 || b.y < 0 || b.x > TABLE.width || b.y > TABLE.height)) throw new Error("OUTSIDE_TABLE");
  }
}
export function canPlace(balls: Ball[], p: Vec): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) &&
    p.x >= R && p.x <= TABLE.width - R && p.y >= R && p.y <= TABLE.height - R &&
    POCKETS.every(q => Math.hypot(p.x - q.x, p.y - q.y) > TABLE.pocketRadius) &&
    balls.every(b => b.id === 0 || b.pocketed || Math.hypot(p.x - b.x, p.y - b.y) >= 2 * R + 0.0001);
}
type StepObserver = (balls: Ball[], events: PhysicsEvent[], t: number) => boolean | void;
export function simulate(initial: Ball[], shot: Shot, options: { frames?: boolean; observe?: StepObserver } = {}): Simulation {
  validate(initial, shot);
  const balls = structuredClone(initial).sort((a,b) => a.id - b.id);
  // Each shot must start from rest, including rotational velocity.
  for (const b of balls) b.vx = b.vy = b.wx = b.wy = 0;
  strike(balls.find(b => b.id === 0)!, shot);
  const events: PhysicsEvent[] = [], frames: Simulation["frames"] = [];
  const capture = (t: number) => frames.push({ t, balls: balls.map(({id,x,y,pocketed})=>({id,x,y,pocketed})) });
  if (options.frames) capture(0);
  let step = 0;
  for (; step < 480 * 60 && balls.some(moving); step++) {
    const t = (step + 1) * DT, start = events.length;
    for (const b of balls) {
      if (b.pocketed) continue;
      b.x += b.vx * DT; b.y += b.vy * DT;
      const pocket = POCKETS.findIndex(p => Math.hypot(b.x-p.x,b.y-p.y) < TABLE.pocketRadius);
      if (pocket !== -1) {
        const speed=Math.hypot(b.vx,b.vy);
        b.pocketed = true; b.vx=b.vy=b.wx=b.wy=0;
        events.push({type:"pocket",t,ball:b.id,pocket,speed}); continue;
      }
      let hit = false;
      const cushionSpeed=Math.max((b.x<R||b.x>TABLE.width-R)?Math.abs(b.vx):0,(b.y<R||b.y>TABLE.height-R)?Math.abs(b.vy):0);
      if (b.x < R && b.vx < 0) { b.x=R; b.vx=-b.vx*0.82; hit=true; }
      if (b.x > TABLE.width-R && b.vx > 0) { b.x=TABLE.width-R; b.vx=-b.vx*0.82; hit=true; }
      if (b.y < R && b.vy < 0) { b.y=R; b.vy=-b.vy*0.82; hit=true; }
      if (b.y > TABLE.height-R && b.vy > 0) { b.y=TABLE.height-R; b.vy=-b.vy*0.82; hit=true; }
      if (hit) events.push({type:"cushion",t,ball:b.id,speed:cushionSpeed});
    }
    for (let i=0;i<balls.length;i++) for (let j=i+1;j<balls.length;j++) {
      const a=balls[i], b=balls[j];
      if (a.pocketed || b.pocketed) continue;
      const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy);
      if (d >= 2*R) continue;
      const nx=d > 1e-12 ? dx/d : 1, ny=d > 1e-12 ? dy/d : 0;
      const push=(2*R-d+1e-7)/2;
      a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;
      const closing=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
      if (closing > 1e-8) {
        const impulse=closing*0.98;
        a.vx-=impulse*nx; a.vy-=impulse*ny; b.vx+=impulse*nx; b.vy+=impulse*ny;
        events.push({type:"collision",t,a:a.id,b:b.id,speed:closing});
      }
    }
    for (const b of balls) if (!b.pocketed) {
      // Small positional overlap corrections must never push a ball beyond the rail.
      b.x=Math.max(R,Math.min(TABLE.width-R,b.x)); b.y=Math.max(R,Math.min(TABLE.height-R,b.y));
      friction(b);
    }
    if (options.frames && step % 16 === 0) capture(t);
    if (options.observe?.(balls,events.slice(start),t) === false) { step++; break; }
  }
  if (step >= 480*60 && balls.some(moving)) throw new Error("SIMULATION_TIMEOUT");
  const duration=step*DT;
  if (options.frames) capture(duration);
  return {balls,events,frames,duration};
}

/** Same simulation as a shot, truncated at the next contact and 8 ball diameters. */
export function predict(initial: Ball[], shot: Shot): Guide {
  const cue0=initial.find(b=>b.id===0)!;
  const result: Guide={incoming:[{x:cue0.x,y:cue0.y}],targetId:null,impact:null,target:[],cue:[],cueStops:false};
  const active={cue:true,target:true}; const distance={cue:0,target:0};
  let collided=false, cueTravel=false, count=0;
  const append=(key:"cue"|"target", b:Ball) => {
    const list=result[key], last=list.at(-1);
    if (last) {
      const delta=Math.hypot(b.x-last.x,b.y-last.y), available=16*R-distance[key];
      if (delta >= available) {
        if (delta>0) list.push({x:last.x+(b.x-last.x)*available/delta,y:last.y+(b.y-last.y)*available/delta});
        active[key]=false; return;
      }
      distance[key]+=delta;
    }
    list.push({x:b.x,y:b.y});
  };
  simulate(initial,shot,{observe:(balls,events)=>{
    const cue=balls.find(b=>b.id===0)!;
    let first: PhysicsEvent | undefined;
    if (!collided) {
      first=events.find(e=>e.type==="collision"&&(e.a===0||e.b===0));
      if (first?.type==="collision") {
        collided=true; result.targetId=first.a===0?first.b:first.a;
        result.impact={x:cue.x,y:cue.y};
        result.incoming.push(result.impact); result.cue.push(result.impact);
        const target=balls.find(b=>b.id===result.targetId)!;
        result.target.push({x:target.x,y:target.y});
      } else if(events.some(e=>e.type!=="collision"&&e.ball===0)) {
        result.incoming.push({x:cue.x,y:cue.y}); return false;
      }
    }
    if (!collided) return;
    for (const event of events) {
      if (event===first) continue;
      for(const key of ["cue","target"] as const) {
        const id=key==="cue"?0:result.targetId;
        if ((event.type==="collision"&&(event.a===id||event.b===id)) || (event.type!=="collision"&&event.ball===id)) active[key]=false;
      }
    }
    cueTravel ||= Math.hypot(cue.x-result.impact!.x,cue.y-result.impact!.y)>R*0.05;
    if (++count % 4===0) {
      if(active.cue) append("cue",cue);
      if(active.target) append("target",balls.find(b=>b.id===result.targetId)!);
    }
    if(!active.cue&&!active.target) return false;
  }});
  result.cueStops=collided&&!cueTravel;
  if(!collided&&result.incoming.length===1) {
    // No collision: trace ends at the physical stopping point.
    const end=simulate(initial,shot).balls.find(b=>b.id===0)!;
    result.incoming.push({x:end.x,y:end.y});
  }
  return result;
}
