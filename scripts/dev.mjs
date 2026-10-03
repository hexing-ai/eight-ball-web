import { spawn } from 'node:child_process';
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Start this script with npm run dev');
const build=spawn(process.execPath,[npm,'run','build:server'],{stdio:'inherit'});
build.on('exit',code=>{
  if(code){process.exitCode=code;return;}
  const backend=spawn(process.execPath,['dist/server/main.js'],{stdio:'inherit',env:{...process.env,ALLOWED_ORIGINS:process.env.ALLOWED_ORIGINS??`http://localhost:${process.env.DEV_PORT??5188},http://127.0.0.1:${process.env.DEV_PORT??5188}`}});
  const frontend=spawn(process.execPath,[npm,'exec','vite','--','--host',process.env.DEV_HOST??'127.0.0.1'],{stdio:'inherit'});
  let stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;backend.kill('SIGTERM');frontend.kill('SIGTERM');};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  backend.on('exit',stop);frontend.on('exit',stop);
});
