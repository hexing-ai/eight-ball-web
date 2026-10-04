export type SoundKind='cue'|'collision'|'cushion'|'pocket'|'turn';
/** Original damped impact synthesis: broadband attack + short material resonances. */
export function impactSamples(kind:SoundKind,rate:number,variant=0):Float32Array{
  const duration=kind==='pocket'?.36:kind==='cushion'?.12:kind==='turn'?.06:.085;
  const out=new Float32Array(Math.ceil(rate*duration));
  let seed=9173+variant*193,low=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const pitch=1+(variant-1)*.035;
  for(let i=0;i<out.length;i++){
    const t=i/rate,n=random();low+=.14*(n-low);
    const mode=(hz:number,decay:number)=>Math.sin(2*Math.PI*hz*pitch*t)*Math.exp(-t/decay);
    let sample=0;
    if(kind==='collision')sample=.48*(n-low)*Math.exp(-t/.0018)+.32*mode(1950,.006)+.18*mode(3270,.0035)+.15*mode(810,.008);
    if(kind==='cue')sample=.38*(n-low)*Math.exp(-t/.0025)+.34*mode(760,.009)+.18*mode(1740,.005)+.12*low*Math.exp(-t/.017);
    if(kind==='cushion')sample=.8*low*Math.exp(-t/.012)+.3*mode(170,.015)+.12*mode(390,.008);
    if(kind==='pocket'){
      // Leather contact, then a delayed, muffled drop inside the pocket.
      sample=.42*low*Math.exp(-t/.016)+.22*mode(240,.014);
      const drop=t-.065;
      if(drop>0)sample+=.7*low*Math.exp(-drop/.036)+.3*Math.sin(2*Math.PI*112*drop)*Math.exp(-drop/.029);
      const settle=t-.145;
      if(settle>0)sample+=.24*low*Math.exp(-settle/.024);
    }
    if(kind==='turn')sample=.12*mode(520,.013);
    const attack=Math.min(1,t/.0003),fade=Math.min(1,(duration-t)/.006);
    out[i]=Math.max(-.95,Math.min(.95,sample*attack*fade));
  }
  return out;
}
