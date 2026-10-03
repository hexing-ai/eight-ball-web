import { readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync,copyFileSync } from 'node:fs';
import { join } from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const sections=[readFileSync('THIRD_PARTY_NOTICES.md','utf8'),'\nBundled dependency notices (includes build-time dependencies; application code is not licensed by this file).'];
for(const dir of Object.keys(lock.packages).filter(p=>p.startsWith('node_modules/')).sort()){
  if(!existsSync(join(dir,'package.json'))&&lock.packages[dir].optional)continue;
  const pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  const files=readdirSync(dir,{withFileTypes:true}).filter(f=>f.isFile()&&/^(licen[sc]e|copying|notice)(\.|$)/i.test(f.name));
  if(!files.length)continue;
  sections.push(`\n${'='.repeat(72)}\n${pkg.name}@${pkg.version}\n`);
  for(const file of files)sections.push(readFileSync(join(dir,file.name),'utf8'));
}
mkdirSync('web/public/licenses',{recursive:true});
copyFileSync('licenses/pooltool-APACHE-2.0.txt','web/public/licenses/pooltool-APACHE-2.0.txt');
writeFileSync('web/public/third-party-notices.txt',sections.join('\n'));
