export type SoundKind='cue'|'collision'|'cushion'|'pocket';
export interface PcmClip { rate:number; samples:Float32Array }
/** Decode our bundled mono PCM16 WAV clips synchronously; no fetch or codec delay. */
export function decodePcmWave(bytes:Uint8Array):PcmClip {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text=(offset:number)=>String.fromCharCode(...bytes.subarray(offset,offset+4));
  if(bytes.length<44||text(0)!=='RIFF'||text(8)!=='WAVE')throw new Error('Invalid audio header');
  let rate=0,dataOffset=0,dataLength=0;
  for(let offset=12;offset+8<=bytes.length;){
    const id=text(offset),size=view.getUint32(offset+4,true),start=offset+8;
    if(start+size>bytes.length)throw new Error('Truncated audio');
    if(id==='fmt '){
      if(size<16||view.getUint16(start,true)!==1||view.getUint16(start+2,true)!==1||view.getUint16(start+14,true)!==16)throw new Error('Expected mono PCM16 audio');
      rate=view.getUint32(start+4,true);
    }
    if(id==='data'){dataOffset=start;dataLength=size;}
    offset=start+size+(size%2);
  }
  if(rate<8000||rate>96000||!dataOffset||!dataLength||dataLength%2)throw new Error('Invalid audio data');
  const samples=new Float32Array(dataLength/2);
  for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(dataOffset+i*2,true)/32768;
  return {rate,samples};
}
