import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Start this script with npm run build:demo');
const result=spawnSync(process.execPath,[npm,'run','build:web'],{
  stdio:'inherit',env:{...process.env,VITE_DEMO:'true'},
});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
writeFileSync('web-dist/.nojekyll','');
