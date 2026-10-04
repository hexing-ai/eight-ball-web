import cue1 from './assets/audio/cue-1.wav?inline';
import cue2 from './assets/audio/cue-2.wav?inline';
import cue3 from './assets/audio/cue-3.wav?inline';
import collision from './assets/audio/collision.wav?inline';
import cushion from './assets/audio/cushion.wav?inline';
import pocket from './assets/audio/pocket.wav?inline';
import { decodePcmWave,type SoundKind,type PcmClip } from '../shared/audio-samples.js';

const sources:Record<SoundKind,string[]>={cue:[cue1,cue2,cue3],collision:[collision],cushion:[cushion],pocket:[pocket]};
const decoded=new Map<string,PcmClip>();
export function recordedClip(kind:SoundKind,variant:number):{key:string;clip:PcmClip}{
  const index=variant%sources[kind].length,key=`${kind}-${index}`;
  let clip=decoded.get(key);
  if(!clip){
    const raw=atob(sources[kind][index].split(',')[1]);
    clip=decodePcmWave(Uint8Array.from(raw,char=>char.charCodeAt(0)));decoded.set(key,clip);
  }
  return {key,clip};
}
