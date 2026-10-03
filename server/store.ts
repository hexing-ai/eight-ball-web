import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
export class CheckpointStore {
  constructor(private directory:string){mkdirSync(directory,{recursive:true});}
  write(code:string,state:unknown){
    const name=join(this.directory,code+".json");
    writeFileSync(name+".tmp",JSON.stringify({savedAt:Date.now(),state}),{mode:0o600});
    renameSync(name+".tmp",name);
  }
  read(code:string):{savedAt:number;state:any}|null{
    if(!/^[A-Z2-9]{8}$/.test(code))return null;
    try{return JSON.parse(readFileSync(join(this.directory,code+".json"),"utf8"));}catch{return null;}
  }
  cleanup(){
    for(const f of readdirSync(this.directory))if(f.endsWith(".json")){
      try{const p=join(this.directory,f);const d=JSON.parse(readFileSync(p,"utf8"));if(Date.now()-d.savedAt>86_400_000)unlinkSync(p);}catch{/* ignore incomplete checkpoints */}
    }
  }
}
