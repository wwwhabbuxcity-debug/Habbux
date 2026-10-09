// Loopback-only test servers are supervised and stopped on every exit path.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createWriteStream} from 'node:fs';
import {mkdir,readFile,symlink,copyFile,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
const backup=resolve(process.env.HABBUX_MIGRATION_BACKUP);
const logDir=resolve(backup,'checks'),site=resolve(backup,'candidate-site-complete');
await mkdir(logDir,{recursive:true});await mkdir(site,{recursive:true});
async function link(source,name){const target=resolve(site,name);try{await symlink(source,target);}catch(e){if(e.code!=='EEXIST')throw e;if(await realpath(target)!==await realpath(source))throw new Error('Unexpected existing fixture source: '+name);}}
await link(resolve('apps/client/dist'),'client');
await link(resolve('apps/client/dist'),'game');
await link('/var/www/gallaxys.com/Octane-Renderer/dist','reference-renderer');
await link('/var/www/gallaxys.com/gamedata/bundled/generic/room.nitro','reference-room.nitro');
await copyFile('tools/gallaxys-migration-v5-reference.html',resolve(site,'reference.html'));
const baseline=(await readFile(resolve(backup,'previous-release.txt'),'utf8')).trim();
const servers=[];
async function server(port,directory,label){
 const log=createWriteStream(resolve(logDir,label+'-server-final.log'));
 await once(log,'open');
 const child=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',directory],{stdio:['ignore',log,log]});servers.push(child);
 for(let i=0;i<50;i++){if(child.exitCode!==null)throw new Error(label+' server exited');try{await fetch(`http://127.0.0.1:${port}/client/`);return;}catch{await new Promise(r=>setTimeout(r,100));}}
 throw new Error(label+' server not ready');
}
async function run(script,label,extra={}){
 const log=createWriteStream(resolve(logDir,label+'-final.log'));
 await once(log,'open');
 const child=spawn(process.execPath,[script],{env:{...process.env,HABBUX_VISUAL_BASE_URL:'http://127.0.0.1:3124',HABBUX_BASELINE_URL:'http://127.0.0.1:3125',HABBUX_GALLAXYS_REFERENCE:'/root/backups/habbux-gallaxys-engine-parity-v2/visual/reference',...extra},stdio:['ignore',log,log]});
 const code=await new Promise((ok,fail)=>{child.once('error',fail);child.once('exit',ok);});log.end();
 if(code!==0)throw new Error(`${label} failed exit ${code}; see log`);
 console.log(label+' PASS');
}
try{
 await server(3124,site,'candidate');await server(3125,baseline,'baseline');
 const phases=process.argv.slice(2);
 if(phases.includes('visual'))await run('tools/gallaxys-migration-v5-visual.mjs','visual-v5',{HABBUX_VISUAL_OUTPUT:resolve(backup,'visual/final')});
 if(phases.includes('reference'))await run('tools/gallaxys-migration-v5-comparison.mjs','comparison-v5',{HABBUX_VISUAL_OUTPUT:resolve(backup,'visual/comparison')});
 if(phases.includes('performance'))await run('tools/master-integration-performance.mjs','performance-v5',{HABBUX_VISUAL_OUTPUT:resolve(backup,'visual/performance'),HABBUX_BENCH_ORDER:'baseline,candidate,candidate,baseline',HABBUX_BENCH_SCENARIOS:'empty-0,long-10,native-2'});
}finally{for(const child of servers)child.kill('SIGTERM');}
