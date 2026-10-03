export class GameAudio{
  enabled=true;private context:AudioContext|null=null;
  unlock(){if(!this.enabled)return;try{this.context??=new AudioContext();void this.context.resume().catch(()=>{});}catch{/* Audio may be blocked; gameplay remains available. */}}
  play(kind:'cue'|'collision'|'pocket'|'turn'){
    if(!this.enabled||!this.context||this.context.state!=='running')return;
    const c=this.context,o=c.createOscillator(),g=c.createGain(),now=c.currentTime;
    const frequency=kind==='pocket'?155:kind==='turn'?680:kind==='cue'?370:1100;
    o.type=kind==='turn'?'sine':'triangle';o.frequency.setValueAtTime(frequency,now);o.frequency.exponentialRampToValueAtTime(frequency*.45,now+.09);
    g.gain.setValueAtTime(kind==='turn'?.04:.06,now);g.gain.exponentialRampToValueAtTime(.001,now+.12);
    o.connect(g);g.connect(c.destination);o.start(now);o.stop(now+.13);
  }
}
