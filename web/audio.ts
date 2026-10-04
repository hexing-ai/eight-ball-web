import type { SoundKind } from '../shared/audio-samples.js';
import { recordedClip } from './sample-bank.js';
export class GameAudio{
  enabled=true;
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private buffers=new Map<string,AudioBuffer>();
  private voices=new Map<AudioBufferSourceNode,GainNode>();
  private last=new Map<SoundKind,number>();
  async unlock(){
    if(!this.enabled)return;
    try{
      if(!this.context){
        const c=this.context=new AudioContext();
        this.master=c.createGain();this.master.gain.value=.75;
        const limiter=c.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=8;limiter.ratio.value=8;limiter.attack.value=.002;limiter.release.value=.09;
        this.master.connect(limiter);limiter.connect(c.destination);
      }
      await this.context.resume().catch(()=>{});
    }catch{/* Audio may be blocked; gameplay remains available. */}
  }
  async preview(kind:SoundKind){await this.unlock();this.play(kind,.65);}
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
    const variant=Math.floor(Math.random()*3),{key,clip}=recordedClip(kind,variant);
    let buffer=this.buffers.get(key);
    if(!buffer){buffer=c.createBuffer(1,clip.samples.length,clip.rate);buffer.getChannelData(0).set(clip.samples);this.buffers.set(key,buffer);}
    const source=c.createBufferSource(),gain=c.createGain(),stereo=c.createStereoPanner();
    source.buffer=buffer;
    source.playbackRate.value=kind==='pocket'?1:1+(Math.random()-.5)*.035;
    gain.gain.value=(kind==='pocket'?.62:kind==='cushion'?.6:.82)*(.16+.84*Math.sqrt(Math.max(0,Math.min(1,strength))));
    stereo.pan.value=Math.max(-.65,Math.min(.65,pan*.65));
    source.connect(gain);gain.connect(stereo);stereo.connect(this.master!);
    this.voices.set(source,gain);
    source.onended=()=>{source.disconnect();gain.disconnect();stereo.disconnect();this.voices.delete(source);};
    source.start();
  }
}
