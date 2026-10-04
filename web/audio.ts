import { impactSamples,type SoundKind } from '../shared/impact-sound.js';
export class GameAudio{
  enabled=true;
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private buffers=new Map<string,AudioBuffer>();
  private voices=new Map<AudioBufferSourceNode,GainNode>();
  private last=new Map<SoundKind,number>();
  unlock(){
    if(!this.enabled)return;
    try{
      if(!this.context){
        const c=this.context=new AudioContext();
        this.master=c.createGain();this.master.gain.value=.75;
        const limiter=c.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=8;limiter.ratio.value=8;limiter.attack.value=.002;limiter.release.value=.09;
        this.master.connect(limiter);limiter.connect(c.destination);
      }
      void this.context.resume().catch(()=>{});
    }catch{/* Audio may be blocked; gameplay remains available. */}
  }
  mute(){
    this.enabled=false;
    for(const source of this.voices.keys())source.stop();
    this.voices.clear();
  }
  play(kind:SoundKind,strength=.45,pan=0){
    const c=this.context;
    if(!this.enabled||!c||c.state!=='running'||document.hidden)return;
    const now=c.currentTime;
    // Coalesce near-simultaneous rack contacts, without dropping pocket sounds.
    if(kind!=='pocket'&&now-(this.last.get(kind)??-1)<.018)return;
    if(strength<.018&&kind!=='pocket')return;
    this.last.set(kind,now);
    if(this.voices.size>=20)return;
    const variant=Math.floor(Math.random()*3),key=`${kind}-${variant}`;
    let buffer=this.buffers.get(key);
    if(!buffer){const samples=impactSamples(kind,c.sampleRate,variant);buffer=c.createBuffer(1,samples.length,c.sampleRate);buffer.getChannelData(0).set(samples);this.buffers.set(key,buffer);}
    const source=c.createBufferSource(),gain=c.createGain(),stereo=c.createStereoPanner();
    source.buffer=buffer;
    gain.gain.value=(kind==='turn'?.28:kind==='pocket'?.6:.7)*(.16+.84*Math.sqrt(Math.max(0,Math.min(1,strength))));
    stereo.pan.value=Math.max(-.65,Math.min(.65,pan*.65));
    source.connect(gain);gain.connect(stereo);stereo.connect(this.master!);
    this.voices.set(source,gain);
    source.onended=()=>{source.disconnect();gain.disconnect();stereo.disconnect();this.voices.delete(source);};
    source.start();
  }
}
