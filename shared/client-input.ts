/** Input state is independent of frame rate. Only the owner may release a charge. */
export class Charge {
  owner:string|null=null;power=0;started=0;
  begin(owner:string,now:number){if(this.owner)return false;this.owner=owner;this.started=now;this.power=0;return true;}
  tick(now:number){if(this.owner==='keyboard')this.power=Math.min(1,Math.max(0,(now-this.started)/1500));return this.power;}
  drag(owner:string,distance:number,range:number){if(this.owner===owner)this.power=Math.min(1,Math.max(0,distance/Math.max(1,range)));}
  release(owner:string,now:number){if(this.owner!==owner)return null;this.tick(now);const power=this.power;this.cancel();return power>=.02?power:null;}
  cancel(){this.owner=null;this.power=0;}
}
export function normalizeAngle(a:number){return Math.atan2(Math.sin(a),Math.cos(a));}
