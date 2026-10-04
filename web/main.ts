import './style.css';
import { Client,type Room } from '@colyseus/sdk';
import { ball,canPlace,TABLE } from '../shared/physics.js';
import { PHYSICS_VERSION,RULES_VERSION,type Ball,type Guide,type Seat,type Simulation,type Vec } from '../shared/types.js';
import { Charge,normalizeAngle } from '../shared/client-input.js';
import type { Match,ActiveShot } from '../server/match.js';
import { TableRenderer,COLORS,type RenderBall } from './render.js';
import { PhysicsClient } from './physics-client.js';
import { GameAudio } from './audio.js';
import { Tutorial } from './tutorial.js';
import { BotGame } from '../shared/bot-game.js';

type Snapshot=ReturnType<Match['snapshot']>;
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const show=(id:string,visible:boolean)=>{$(id).hidden=!visible;};
const text=(id:string,value:string)=>{$(id).textContent=value;};
const button=(id:string)=>$<HTMLButtonElement>(id);
const read=(key:string,session=false)=>{try{return(session?sessionStorage:localStorage).getItem(key);}catch{return null;}};
const save=(key:string,value:string|null,session=false)=>{try{const s=session?sessionStorage:localStorage;value===null?s.removeItem(key):s.setItem(key,value);}catch{/* Private mode storage may be unavailable. */}};
function uuid(){return typeof crypto.randomUUID==='function'?crypto.randomUUID():'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(+c^(crypto.getRandomValues(new Uint8Array(1))[0]&15)>>(+c/4)).toString(16));}
const canvas=$<HTMLCanvasElement>('table'),renderer=new TableRenderer(canvas),audio=new GameAudio();
let toastTimer=0;
function toast(message:string){text('toast',message);show('toast',true);clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>show('toast',false),3800);}
const physics=new PhysicsClient(toast),charge=new Charge();
const serverBase=(import.meta.env.VITE_BACKEND_URL||`${location.origin}/socket`).replace(/\/$/,'');
const apiBase=import.meta.env.VITE_BACKEND_URL?serverBase.replace(/^ws:/,'http:').replace(/^wss:/,'https:'):location.origin;
const sdk=new Client(serverBase);
const demoMode=import.meta.env.VITE_DEMO==='true'||new URLSearchParams(location.search).has('demo');
const networkConfigured=!demoMode||!!import.meta.env.VITE_BACKEND_URL;
let localGame:BotGame|null=null;
const connected=(s:Snapshot)=>s.players.every(p=>p?.connected);
let room:Room|null=null,state:Snapshot|null=null,seat:Seat=0,inviteCode='',online=false,connecting=false,epoch=0,reconnecting=false,reconnectUntil=0;
let angle=0,spin=0,previewPower=.3,guide:Guide|null=null,guideVersion=0,previewKey='',lastPreview=0,lastAim=0,serverOffset=0;
let placement:Vec|null=null,placing=false,sending=false,pendingShot:{type:'shot';requestId:string;turnVersion:number;shot:{angle:number;power:number;spin:number}}|null=null,pendingAt=0;
let playback:{key:string;shot:ActiveShot;result:Simulation|null;eventIndex:number}|null=null;
let activePointer:number|null=null,pointerMode:'aim'|'fine'|'spin'|'power'|'place'|null=null,pointerStartY=0,pointerLastY=0,pointerAimOffset=0;
let lobbyMode:'create'|'join'='create',sensitivity=Number(read('eightball-sensitivity')||.05),frameCount=0,lastFrame=performance.now(),fps=60;
const previewBalls=[ball(0,.86,.87),ball(1,.58,.24),ball(2,1.25,1.05),ball(3,1.54,.52),ball(4,.38,.55),ball(8,1.22,.36),ball(9,2.25,.64),ball(10,1.85,.98),ball(13,2.0,.22),ball(14,2.23,.95)];
angle=Math.atan2(.54-.87,1.49-.86);
const settings=$<HTMLDialogElement>('settings'),confirmDialog=$<HTMLDialogElement>('confirm-dialog');
const tutorial=new Tutorial(()=>{cancelInput();updateView();},()=>!!state&&!['waiting','finished'].includes(state.phase));
const portrait=()=>matchMedia('(orientation:portrait) and (max-width:900px)').matches;
const overlaysOpen=()=>!$('lobby').hidden||!$('waiting').hidden||!$('result').hidden||settings.open||confirmDialog.open||tutorial.open;
const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.matches('input,textarea,select')||target.isContentEditable);
const turnAllowed=()=>!!state&&online&&state.phase==='aiming'&&state.current===seat&&connected(state)&&!overlaysOpen()&&!portrait()&&!sending;
const canShoot=()=>turnAllowed()&&!state!.ballInHand;
const canAdjust=()=>canShoot()&&!charge.owner&&activePointer===null;
function cancelInput(){charge.cancel();activePointer=null;pointerMode=null;document.body.classList.remove('charging');}
function invalidateGuide(){guideVersion++;guide=null;previewKey='';}
function send(payload:Record<string,unknown>){
 if(localGame&&online){void localGame.send({requestId:uuid(),...payload} as Parameters<BotGame['send']>[0]);return true;}
 if(!room||!online||!room.connection.isOpen)return false;room.send('command',{requestId:uuid(),...payload});return true;
}
function persistSession(){if(room&&inviteCode)save('eightball-room',JSON.stringify({token:room.reconnectionToken,code:inviteCode,until:Date.now()+65_000,backend:serverBase}),true);}
function clearSession(){save('eightball-room',null,true);}
function networkMessage(message:string){show('network-banner',!!message);text('network-banner',message);}
function resetAim(){cancelInput();spin=0;previewPower=.3;angle=0;placement=null;placing=false;sending=false;pendingShot=null;playback=null;invalidateGuide();updateSpin();}
function updateSpin(){ $('spin-dot').style.top=`${50-spin*36}%`;$('spin-ball').setAttribute('aria-valuenow',String(Math.round(spin*100)));text('spin-label',`击点 · ${spin>.08?'高杆':spin<-.08?'低杆':'中杆'}`);}
function errorMessage(raw:unknown){
 const value=raw instanceof Error?raw.message:String(raw);
 const labels:Record<string,string>={ROOM_NOT_FOUND:'没有找到这个房间，请检查邀请码。',ROOM_ENDED:'房间已结束或服务已重启，请重新建房。',INVITE_REQUIRED_OR_FULL:'房间已满或邀请码不正确。',INVALID_JOIN:'昵称或邀请码格式不正确。',INVALID_CREATE:'请输入有效昵称后重试。',SERVER_FULL:'球桌暂时已满，请稍后再试。',NOT_YOUR_TURN:localGame?'现在轮到电脑击球。':'现在轮到好友击球。',STALE_TURN:'回合已更新，请重新瞄准。',WAITING_RECONNECT:'好友正在重连，请稍候。',NOT_AIMING:'请等待所有球停稳。',PLACE_CUE_FIRST:'请先放好白球。',INVALID_PLACEMENT:'白球不能重叠、越界或放在袋口。',INVALID_COMMAND:'操作参数无效，请重试。',RATE_LIMITED:'操作过于频繁，请稍候。',SIMULATION_FAILED:'本杆计算失败，请重新出杆。',OPERATION_CONFLICT:'这次击球已处理，正在同步球位。'};
 for(const [key,label] of Object.entries(labels))if(value.includes(key))return label;
 return '连接未成功，请检查网络或确认房间仍然有效。';
}
function renderTray(id:string,group:'solid'|'stripe'|null,balls:Ball[]){
 const tray=$(id);const key=`${group}:${balls.filter(b=>b.pocketed).map(b=>b.id).join(',')}`;
 if(tray.dataset.key===key)return;tray.dataset.key=key;tray.replaceChildren();
 for(let i=0;i<7;i++){const item=document.createElement('span');item.className='hud-ball';if(!group){item.classList.add('empty');item.setAttribute('aria-hidden','true');}else{const n=i+(group==='solid'?1:9);item.style.setProperty('--ball-color',COLORS[n>8?n-8:n]);if(group==='stripe')item.classList.add('stripe');const potted=balls.some(b=>b.id===n&&b.pocketed);if(potted)item.classList.add('potted');const label=document.createElement('i');label.textContent=String(n);item.append(label);item.title=`${n}号球${potted?'已进袋':'待击打'}`;}tray.append(item);}
}
function updateControls(){
 $('app').inert=!$('lobby').hidden||!$('waiting').hidden||!$('result').hidden;
 document.body.classList.toggle('controls-disabled',!canShoot());
 for(const id of ['fine-slider','power-slider','spin-ball'])$(id).setAttribute('aria-disabled',String(!canShoot()));
 button('fine-up').disabled=!canShoot()||!!charge.owner;button('fine-down').disabled=button('fine-up').disabled;
}
function updateView(){
 updateControls();
 button('invite-button').disabled=localGame?!state:!inviteCode;
 $('invite-button').querySelector('span')!.textContent=localGame?'球桌':'邀请码';
 $('invite-button').querySelector('.copy-icon')!.textContent=localGame?'↻':'复制';
 text('settings-note',localGame?'人机对战：你与电脑轮流击球，遵守相同八球规则。每回合 60 秒，打开菜单不暂停；电脑会自动摆放自由球及出杆。':'好友联机：两人各用自己的设备，以邀请码加入同一局。每回合 60 秒，打开菜单不暂停。');
 $('connection').classList.toggle('offline',!!room&&!online);
 text('connection',localGame?'人机对战':room?(online?'已连接':'正在重连'):'好友对战');
 text('leave-button',localGame?'结束人机对战 / 返回大厅':'离开房间');
 if(!state){renderTray('tray-0','solid',previewBalls);renderTray('tray-1','stripe',previewBalls);return;}
 const displaySeats:[Seat,Seat]=[seat,seat===0?1:0];
 displaySeats.forEach((actual,index)=>{const p=state!.players[actual];text(`name-${index}`,p?.name??'等待好友');text(`group-${index}`,state!.groups[actual]==='solid'?'全色':state!.groups[actual]==='stripe'?'花色':'尚未分组');renderTray(`tray-${index}`,state!.groups[actual],state!.balls);$(`player-${index}`).classList.toggle('active',state!.current===actual&&state!.phase==='aiming');text(`ready-${index}`,state!.phase==='waiting'?(p?.ready?'已准备':''):'');});
 text('invite-code',localGame?'重新开局':inviteCode);text('waiting-code',inviteCode);
 show('waiting',state.phase==='waiting');show('result',state.phase==='finished');show('lobby',false);
 if(state.phase==='waiting'){
   const mine=state.players[seat],friend=state.players[seat===0?1:0];text('waiting-title',friend?'好友已入座':'球桌已就绪');text('waiting-description',friend?'双方准备后，即可开球。':'分享邀请码，等好友入座。');text('waiting-self',`${mine?.name??'你'} · ${mine?.ready?'已准备':'已入座'}`);text('waiting-friend',friend?`${friend.name} · ${friend.connected?(friend.ready?'已准备':'未准备'):'已断线'}`:'等待好友…');text('ready-button',mine?.ready?'已准备，等待好友':'准备开始');button('ready-button').disabled=!!mine?.ready||!online;
 }
 if(state.phase==='finished'){
   text('result-title',state.winner===null?'本局已结束':state.winner===seat?'漂亮，这局你赢了':'好球，下局再来');text('result-reason',state.reason==='对方认输'?(state.winner===seat?'好友认输，本局你获胜。':'你已认输，本局好友获胜。'):state.reason==='对方断线超时'?(state.winner===seat?'好友断线超时，本局你获胜。':'重连超时，本局好友获胜。'):state.reason);text('rematch-button',state.players[seat]?.rematch?'已邀请，等待好友':'再来一局');button('rematch-button').disabled=!!state.players[seat]?.rematch||!online||!connected(state);text('rematch-status',state.players[seat===0?1:0]?.rematch?'好友想再来一局':!connected(state)?'好友已离开，可以返回大厅重新邀请':'');
 }
 if(localGame&&state.phase==='finished'){
   text('result-reason',state.reason==='对方认输'?'你已认输，电脑获胜。':state.reason);
   text('rematch-button','再来一局');text('rematch-status','与电脑再较量一局。');
 }
 document.querySelector('.avatar-first span')!.textContent='你';
 document.querySelector('.avatar-second span')!.textContent=localGame?'机':'友';
 show('resign-button',!['waiting','finished'].includes(state.phase));show('leave-button',true);
 const needsPlace=turnAllowed()&&state.ballInHand;
 show('place-confirm',needsPlace&&!!placement);button('place-confirm').disabled=placing||!placement||!canPlace(state.balls,placement);
 show('table-note',needsPlace);if(needsPlace)text('table-note','自由球 · 拖动白球，确认后瞄准');
 let label=state.phase==='waiting'?'等待双方准备':state.phase==='finished'?'本局结束':state.phase==='simulating'?'出杆确认中':state.phase==='animating'?'球正在运动':state.current===seat?(state.ballInHand?'请放置白球':'轮到你击球'):localGame?'电脑正在思考…':'等待好友击球';
 text('turn-label',label);
 $('app').dataset.phase=state.phase;$('app').dataset.seat=String(seat);$('app').dataset.current=String(state.current);$('app').dataset.turnVersion=String(state.turnVersion);$('app').dataset.matchId=state.matchId;
 updateControls();
}
function applySnapshot(next:Snapshot){
 if(next.physicsVersion!==PHYSICS_VERSION||next.rulesVersion!==RULES_VERSION){online=false;cancelInput();networkMessage('游戏版本已更新，请刷新页面后重新加入。');return;}
 if(state&&next.matchId===state.matchId&&next.revision<state.revision)return;
 const old=state;serverOffset=next.serverTime-Date.now();
 if(!old||old.matchId!==next.matchId)resetAim();
 else if(old.turnVersion!==next.turnVersion||next.phase!=='aiming'||!connected(next)){cancelInput();invalidateGuide();}
 state=next;
 if(old&&(old.turnVersion!==next.turnVersion||next.phase!=='aiming')){sending=false;pendingShot=null;placing=false;}
 if(next.phase==='aiming'&&next.ballInHand&&next.current===seat&&!placement){const p={x:TABLE.width*.25,y:TABLE.height*.5};placement=canPlace(next.balls,p)?p:{x:.3,y:.3};}
 if(!next.ballInHand)placement=null;
 if(next.phase==='animating'&&next.activeShot)void startPlayback(next.activeShot);
 if(next.phase!=='animating'&&next.phase!=='simulating')playback=null;
 if(old&&old.turnVersion!==next.turnVersion&&next.current===seat&&next.phase==='aiming'){audio.play('turn');toast(next.reason);}
 persistSession();updateView();
}
async function startPlayback(shot:ActiveShot){
 const key=`${state?.matchId}:${shot.id}`;if(playback?.key===key)return;
 angle=shot.input.angle;
 const playing={key,shot,result:null as Simulation|null,eventIndex:0};playback=playing;invalidateGuide();
 audio.play('cue',shot.input.power,shot.before.find(b=>b.id===0)!.x/TABLE.width*2-1);
 try{const result=await physics.simulate(shot.before,shot.input);if(playback!==playing)return;playing.result=result;const elapsed=Math.max(0,(Date.now()+serverOffset-shot.startsAt)/1000);while(playing.eventIndex<result.events.length&&result.events[playing.eventIndex].t<elapsed-.05)playing.eventIndex++;}
 catch{toast(localGame?'动画计算未完成，等待本杆结算。':'动画计算未完成，等待服务器同步球位。');}
}
function bindRoom(next:Room){
 room=next;online=true;reconnecting=false;next.reconnection.enabled=false;
 next.onMessage('welcome',(data:{seat:Seat;inviteCode:string})=>{seat=data.seat;inviteCode=data.inviteCode;persistSession();updateView();});
 next.onMessage('snapshot',applySnapshot);
 next.onMessage('shot',(shot:ActiveShot)=>void startPlayback(shot));
 next.onMessage('aim',(data:{angle:number;turnVersion:number})=>{if(state&&state.current!==seat&&state.phase==='aiming'&&data.turnVersion===state.turnVersion)angle=data.angle;});
 next.onMessage('ack',(data:{requestId:string;status?:string;operation?:{status:string}|null})=>{
   if(pendingShot&&data.operation?.status==='failed'){pendingShot=null;sending=false;toast('本杆未完成，请重新出杆。');}
   if(pendingShot&&data.operation===null&&state?.phase==='aiming'&&state.turnVersion===pendingShot.turnVersion)send(pendingShot);
 });
 next.onMessage('error',(data:{code:string;requestId?:string})=>{toast(errorMessage(data.code));if(data.requestId===pendingShot?.requestId){pendingShot=null;sending=false;}placing=false;send({type:'sync'});updateView();});
 next.onDrop(()=>{if(room!==next)return;online=false;cancelInput();invalidateGuide();networkMessage('连接中断，正在恢复对局…');updateView();});
 next.onLeave((code:number)=>{if(room!==next)return;online=false;cancelInput();if(code===4000){clearSession();if(state?.phase==='finished'){updateView();return;}returnLobby('房间已关闭，请重新邀请好友。');return;}void reconnect(next.reconnectionToken,epoch);});
 next.onError(()=>{if(room===next&&!next.connection.isOpen)networkMessage('网络暂时中断，正在尝试恢复…');});
 networkMessage('');send({type:'sync'});persistSession();
}
async function reconnect(token:string,expectedEpoch:number){
 if(reconnecting)return;reconnecting=true;reconnectUntil=Date.now()+(state?.reconnectMs??60_000);cancelInput();
 while(Date.now()<reconnectUntil&&expectedEpoch===epoch){
   try{const next=await sdk.reconnect(token);if(expectedEpoch!==epoch){void next.leave();return;}bindRoom(next);toast('已恢复连接');return;}
   catch{await new Promise(r=>setTimeout(r,1500));}
 }
 if(expectedEpoch===epoch){reconnecting=false;clearSession();returnLobby('重连超时或房间已结束，请重新创建房间。');}
}
function returnLobby(message=''){
 localGame?.stop();localGame=null;
 epoch++;room=null;state=null;inviteCode='';online=false;connecting=false;reconnecting=false;clearSession();resetAim();
 show('waiting',false);show('result',false);show('lobby',true);show('table-note',false);show('place-confirm',false);networkMessage('');
 text('lobby-error',message);text('name-0','你');text('name-1','等待好友');text('group-0','全色');text('group-1','花色');text('ready-0','');text('ready-1','');text('timer','8');text('turn-label','约好友，来一局');text('invite-code','— — — —');show('resign-button',false);show('leave-button',false);button('connect-button').disabled=false;setLobbyMode(lobbyMode);showModeSelect();updateView();
}
function setLobbyMode(mode:'create'|'join'){
 lobbyMode=mode;$('create-tab').setAttribute('aria-selected',String(mode==='create'));$('join-tab').setAttribute('aria-selected',String(mode==='join'));show('code-field',mode==='join');$<HTMLInputElement>('join-code').required=mode==='join';text('connect-button',mode==='join'?'加入好友的球桌 ↗':'创建好友房间 ↗');
}
$('create-tab').onclick=()=>setLobbyMode('create');$('join-tab').onclick=()=>setLobbyMode('join');
$('lobby-form').onsubmit=async(event)=>{
 event.preventDefault();if(connecting)return;audio.unlock();if(!networkConfigured){text('lobby-error','好友联机尚未开放，请先体验人机对战。');return;}const nickname=$<HTMLInputElement>('nickname').value.trim(),code=$<HTMLInputElement>('join-code').value.trim().toUpperCase();
 if(!nickname||/[\u0000-\u001f\u007f<>]/u.test(nickname)){text('lobby-error','请填写 1–16 个字的昵称，不含特殊符号。');return;}
 if(lobbyMode==='join'&&!/^[A-Z2-9]{8}$/.test(code)){text('lobby-error','邀请码需要是 8 位大写字母或数字。');return;}
 connecting=true;button('connect-button').disabled=true;text('connect-button','正在连接球桌…');text('lobby-error','');save('eightball-name',nickname);const currentEpoch=++epoch;
 try{
   let next:Room;
   if(lobbyMode==='create')next=await sdk.create('eightball',{nickname,creatorKey:uuid(),protocol:1});
   else{const response=await fetch(`${apiBase}/api/rooms/${code}`,{signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok)throw new Error(result.error);next=await sdk.joinById(result.roomId,{nickname,inviteCode:code,protocol:1});}
   if(currentEpoch!==epoch){void next.leave();return;}state=null;bindRoom(next);
 }catch(error){text('lobby-error',errorMessage(error));}
 finally{if(currentEpoch===epoch){connecting=false;button('connect-button').disabled=false;setLobbyMode(lobbyMode);}}
};
$('ready-button').onclick=()=>{audio.unlock();if(send({type:'ready'}))button('ready-button').disabled=true;};
$('rematch-button').onclick=()=>{if(localGame){send({type:'rematch'});return;}if(send({type:'rematch'}))button('rematch-button').disabled=true;};
async function copy(value:string,label:string){
 try{await navigator.clipboard.writeText(value);toast(`${label}已复制`);}catch{const t=document.createElement('textarea');t.value=value;t.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(ok)toast(`${label}已复制`);else toast(`邀请码：${inviteCode}`);}
}
function invitationLink(){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('invite',inviteCode);return url.href;}
$('copy-code').onclick=()=>void copy(inviteCode,'邀请码');$('copy-link').onclick=()=>void copy(invitationLink(),'邀请链接');$('invite-button').onclick=()=>{
 if(!localGame){void copy(invitationLink(),'邀请链接');return;}
 cancelInput();text('confirm-title','重新开局？');text('confirm-description','当前人机对局会清空，你与电脑重新开局。');text('confirm-yes','重新开局');confirmAction=startBot;confirmDialog.showModal();
};
async function leave(){const current=room;room=null;epoch++;online=false;cancelInput();clearSession();if(current){current.reconnection.enabled=false;void current.leave();}returnLobby();}
function requestLeave(){cancelInput();settings.close();if(state&&!['waiting','finished'].includes(state.phase)){text('confirm-title','离开这场对局？');text('confirm-description',localGame?'当前人机对局不会保存，可以随时重新开始。':'正在进行的对局会按认输处理。');text('confirm-yes','确认离开');confirmAction=()=>void leave();confirmDialog.showModal();}else void leave();}
let confirmAction:()=>void=()=>{};
$('waiting-leave').onclick=requestLeave;$('result-leave').onclick=requestLeave;$('leave-button').onclick=requestLeave;
$('resign-button').onclick=()=>{cancelInput();settings.close();text('confirm-title','确认认输？');text('confirm-description',localGame?'本局将判电脑获胜，结束后可以再来一局。':'本局将判好友获胜，结束后可以再来一局。');text('confirm-yes','确认认输');confirmAction=()=>{send({type:'resign'});};confirmDialog.showModal();};
$('confirm-cancel').onclick=()=>confirmDialog.close();$('confirm-yes').onclick=()=>{confirmDialog.close();confirmAction();};
function openSettings(){cancelInput();settings.showModal();updateView();}
$('tutorial-replay').onclick=()=>{settings.close();tutorial.show();};
$('menu-button').onclick=openSettings;$('lobby-help').onclick=openSettings;$('settings-close').onclick=()=>settings.close();settings.addEventListener('close',()=>{cancelInput();updateView();});
$<HTMLSelectElement>('sensitivity').value=String(sensitivity);$('sensitivity').onchange=()=>{sensitivity=Number($<HTMLSelectElement>('sensitivity').value);save('eightball-sensitivity',String(sensitivity));};
audio.enabled=read('eightball-sound')!=='off';
function updateSound(){button('sound-button').setAttribute('aria-pressed',String(audio.enabled));button('sound-button').setAttribute('aria-label',audio.enabled?'关闭声音':'开启声音');text('sound-button',audio.enabled?'♪':'♩');}
$('sound-button').onclick=()=>{if(audio.enabled)audio.mute();else audio.enabled=true;save('eightball-sound',audio.enabled?'on':'off');audio.unlock();updateSound();};updateSound();
$('fullscreen-button').onclick=()=>{cancelInput();const op=document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.();void op?.catch(()=>toast('当前浏览器不支持全屏，可直接横屏游玩。'));};
function shoot(power:number){
 if(!canShoot()||!state)return;audio.unlock();cancelInput();guide=null;previewPower=power;
 pendingShot={type:'shot',requestId:uuid(),turnVersion:state.turnVersion,shot:{angle:normalizeAngle(angle),power,spin}};pendingAt=Date.now();sending=true;
 if(!send(pendingShot)){sending=false;pendingShot=null;toast('网络未连接，请稍后再试。');}updateView();
}
function startCharge(owner:string){if(!canShoot()||charge.owner)return false;audio.unlock();if(!charge.begin(owner,performance.now()))return false;document.body.classList.add('charging');return true;}
function endCharge(owner:string){const power=charge.release(owner,performance.now());document.body.classList.remove('charging');if(power!==null)shoot(power);}
window.addEventListener('keydown',e=>{
 if(e.key==='Tab'&&!settings.open&&!confirmDialog.open&&!tutorial.open){
   const overlay=['lobby','waiting','result'].map(id=>$(id)).find(el=>!el.hidden);
   if(overlay){const targets=Array.from(overlay.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length);const first=targets[0],last=targets.at(-1);if(first&&last){if(e.shiftKey&&(document.activeElement===first||!overlay.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!overlay.contains(document.activeElement))){e.preventDefault();first.focus();}}}
 }
 if(e.code==='Escape'){cancelInput();return;}
 if(e.code!=='KeyW'||editable(e.target)||e.ctrlKey||e.metaKey||e.altKey)return;
 if(!canShoot())return;e.preventDefault();if(!e.repeat&&activePointer===null)startCharge('keyboard');
});
window.addEventListener('keyup',e=>{if(e.code==='KeyW'&&charge.owner==='keyboard'){e.preventDefault();if(editable(e.target)||!canShoot())cancelInput();else endCharge('keyboard');}});
window.addEventListener('blur',cancelInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelInput();else if(online)send({type:'sync'});});
window.addEventListener('resize',()=>{cancelInput();renderer.resize();updateView();});
function setAngle(value:number){angle=normalizeAngle(value);$('fine-slider').setAttribute('aria-valuenow',String(Math.round(angle*180/Math.PI)));invalidateGuide();if(performance.now()-lastAim>100){lastAim=performance.now();send({type:'aim',angle,turnVersion:state?.turnVersion});}}
function nudge(direction:number){if(canAdjust())setAngle(angle+direction*.1*Math.PI/180);}
$('fine-up').onclick=()=>nudge(-1);$('fine-down').onclick=()=>nudge(1);
$('fine-slider').onkeydown=e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();nudge(e.key==='ArrowUp'||e.key==='ArrowLeft'?-1:1);}};
$('spin-ball').onkeydown=e=>{if(canAdjust()&&['ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();spin=e.key==='Home'?0:Math.max(-1,Math.min(1,spin+(e.key==='ArrowUp'?.1:-.1)));updateSpin();invalidateGuide();}};
function setSpin(y:number){const rect=$('spin-ball').getBoundingClientRect();spin=Math.max(-1,Math.min(1,(rect.top+rect.height/2-y)/(rect.height*.36)));if(Math.abs(spin)<.08)spin=0;updateSpin();invalidateGuide();}
function beginPointer(e:PointerEvent,mode:NonNullable<typeof pointerMode>,element:HTMLElement){
 if(!e.isPrimary||activePointer!==null||charge.owner||!turnAllowed()||(mode!=='place'&&state?.ballInHand))return false;
 e.preventDefault();activePointer=e.pointerId;pointerMode=mode;pointerStartY=pointerLastY=e.clientY;element.setPointerCapture(e.pointerId);audio.unlock();return true;
}
function bindPointer(element:HTMLElement,mode:'fine'|'spin'|'power'){
 element.addEventListener('pointerdown',e=>{if(!beginPointer(e,mode,element))return;if(mode==='power'&&!startCharge(`pointer-${e.pointerId}`)){cancelInput();return;}if(mode==='spin')setSpin(e.clientY);});
 element.addEventListener('pointermove',e=>{
   if(activePointer!==e.pointerId||pointerMode!==mode)return;e.preventDefault();
   if(mode==='fine'){setAngle(angle+(e.clientY-pointerLastY)*sensitivity*Math.PI/180);pointerLastY=e.clientY;}
   if(mode==='spin')setSpin(e.clientY);
   if(mode==='power'){charge.drag(`pointer-${e.pointerId}`,e.clientY-pointerStartY,element.clientHeight*.8);}
 });
 element.addEventListener('pointerup',e=>{if(activePointer!==e.pointerId||pointerMode!==mode)return;activePointer=null;pointerMode=null;if(mode==='power')endCharge(`pointer-${e.pointerId}`);});
 element.addEventListener('pointercancel',cancelInput);element.addEventListener('lostpointercapture',e=>{if(activePointer===e.pointerId)cancelInput();});
}
bindPointer($('fine-slider'),'fine');bindPointer($('spin-ball'),'spin');bindPointer($('power-slider'),'power');
function aimAt(point:Vec,offset=0){const cue=state?.balls.find(b=>b.id===0);if(cue&&Math.hypot(point.x-cue.x,point.y-cue.y)>.025)setAngle(Math.atan2(point.y-cue.y,point.x-cue.x)+offset);}
canvas.addEventListener('pointerdown',e=>{const mode=state?.ballInHand?'place':'aim';if(!beginPointer(e,mode,canvas))return;const p=renderer.point(e.clientX,e.clientY);if(mode==='place'){placement=p;updateView();}else{const cue=state!.balls.find(b=>b.id===0)!;const dx=p.x-cue.x,dy=p.y-cue.y;pointerAimOffset=(dx*Math.cos(angle)+dy*Math.sin(angle)<0&&Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle))<.08)?Math.PI:0;aimAt(p,pointerAimOffset);}});
canvas.addEventListener('pointermove',e=>{
 if(charge.owner)return;
 if(activePointer===e.pointerId&&pointerMode==='place'){placement=renderer.point(e.clientX,e.clientY);updateView();return;}
 if((e.pointerType==='mouse'&&activePointer===null&&canAdjust())||(activePointer===e.pointerId&&pointerMode==='aim'))aimAt(renderer.point(e.clientX,e.clientY),activePointer===e.pointerId?pointerAimOffset:0);
});
canvas.addEventListener('pointerup',e=>{if(activePointer===e.pointerId){activePointer=null;pointerMode=null;}});canvas.addEventListener('pointercancel',cancelInput);canvas.addEventListener('lostpointercapture',e=>{if(activePointer===e.pointerId)cancelInput();});
$('place-confirm').onclick=()=>{if(turnAllowed()&&state?.ballInHand&&placement&&canPlace(state.balls,placement)){placing=true;send({type:'place',turnVersion:state.turnVersion,position:placement});updateView();}};
function currentBalls(now:number):RenderBall[]{
 if(!state)return previewBalls;
 const p=playback;if(!p||!p.result||state.phase!=='animating')return state.balls;
 const time=Math.max(0,Math.min(p.result.duration,(now+serverOffset-p.shot.startsAt)/1000)),frames=p.result.frames;
 let lo=0,hi=frames.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(frames[mid].t<=time)lo=mid;else hi=mid-1;}
 const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],f=b.t===a.t?0:(time-a.t)/(b.t-a.t);
 while(p.eventIndex<p.result.events.length&&p.result.events[p.eventIndex].t<=time){
   const event=p.result.events[p.eventIndex++];if(time-event.t>.08)continue;
   const hit=a.balls.find(ball=>ball.id===(event.type==='collision'?event.a:event.ball));
   audio.play(event.type,Math.min(1,(event.speed??1.2)/4),hit?hit.x/TABLE.width*2-1:0);
 }
 return a.balls.map((ball,index)=>{const target=b.balls[index];return {...ball,x:ball.x+(target.x-ball.x)*f,y:ball.y+(target.y-ball.y)*f,pocketed:ball.pocketed||(f>.95&&target.pocketed)};});
}
function updatePreview(now:number){
 if(!canShoot()){if(guide){guide=null;guideVersion++;previewKey='';}return;}
 const power=charge.owner?Math.max(.025,charge.power):previewPower;
 const key=`${state!.matchId}:${state!.turnVersion}:${angle.toFixed(5)}:${power.toFixed(3)}:${spin.toFixed(3)}`;
 if(key===previewKey||now-lastPreview<40)return;previewKey=key;lastPreview=now;const generation=++guideVersion;
 physics.preview(state!.balls,{angle,power,spin},result=>{if(generation===guideVersion&&canShoot())guide=result;});
}
let lastUi=0;
function frame(now:number){
 localGame?.tick();
 const delta=now-lastFrame;lastFrame=now;if(delta>0&&delta<200)fps=fps*.95+1000/delta*.05;frameCount++;
 if(!document.hidden){
 charge.tick(now);updatePreview(now);
 const power=charge.owner?charge.power:previewPower;
 renderer.draw({balls:currentBalls(Date.now()),angle,power:charge.owner?charge.power:0,guide:canShoot()?guide:null,showCue:!!state&&state.phase==='aiming'&&!state.ballInHand&&!overlaysOpen(),placement:turnAllowed()&&state?.ballInHand?placement:null,placementValid:!!state&&!!placement&&canPlace(state.balls,placement),motion:now});
 if(now-lastUi>60){lastUi=now;$('power-fill').style.height=`${Math.max(0,power)*100}%`;$('power-cue').style.top=`${3+(charge.owner?charge.power:0)*Math.max(0,$('power-slider').clientHeight-40)}px`;$('power-slider').setAttribute('aria-valuenow',String(Math.round(power*100)));$('power-value').innerHTML=`${Math.round(power*100)}<span>%</span>`;text('power-label',charge.owner?'当前力度':'预览力度');
 if(state){const seconds=state.deadline===null?null:Math.max(0,Math.ceil((state.deadline-(Date.now()+serverOffset))/1000));text('timer',state.phase==='aiming'?(seconds===null?'Ⅱ':String(seconds)):state.phase==='animating'?'…':state.phase==='finished'?'8':'—');$('clock').style.setProperty('--progress',`${seconds===null?100:Math.min(100,seconds/60*100)}%`);$('clock').classList.toggle('urgent',seconds!==null&&seconds<=10);
 if(reconnecting)networkMessage(`正在恢复连接 · ${Math.max(0,Math.ceil((reconnectUntil-Date.now())/1000))} 秒`);
 else if(!connected(state)&&!['waiting','finished'].includes(state.phase)){const gone=state.players.find(p=>p&&!p.connected);const remaining=gone?.disconnectedAt?Math.max(0,Math.ceil((state.reconnectMs-(Date.now()+serverOffset-gone.disconnectedAt))/1000)):60;networkMessage(`好友断线，等待恢复 · ${remaining} 秒`);}else if(online)networkMessage('');
 }
 }
 }
 requestAnimationFrame(frame);
}
setInterval(()=>{
 if(online&&!localGame){persistSession();if(pendingShot&&Date.now()-pendingAt>3000){send({type:'status',operationId:pendingShot.requestId});send({type:'sync'});pendingAt=Date.now();}}
},2000);
new ResizeObserver(()=>renderer.resize()).observe($('table-stage'));
$<HTMLInputElement>('nickname').value=read('eightball-name')??'';
const invite=new URLSearchParams(location.search).get('invite')?.toUpperCase();if(invite){setLobbyMode('join');$<HTMLInputElement>('join-code').value=invite;}
updateView();updateSpin();renderer.resize();requestAnimationFrame(frame);
// Read-only diagnostics are excluded from production builds; no mutation hooks.
if(import.meta.env.DEV)Object.defineProperty(window,'__eightBall',{get:()=>({state:state?structuredClone(state):null,seat,online,angle,spin,power:charge.power,charging:!!charge.owner,sending,guide:guide?structuredClone(guide):null,fps:Math.round(fps),frameCount,placement,renderBalls:currentBalls(Date.now())})});
async function restore(){
 const saved=read('eightball-room',true);if(!saved)return;
 try{const s=JSON.parse(saved);if(s.backend!==serverBase||s.until<Date.now()||(invite&&s.code!==invite)){clearSession();return;}connecting=true;const restoreEpoch=epoch;button('connect-button').disabled=true;text('connect-button','正在恢复上一局…');const next=await sdk.reconnect(s.token);if(epoch!==restoreEpoch){void next.leave();return;}bindRoom(next);}
 catch{clearSession();text('lobby-error','上一间房已结束，可以重新建房。');}
 finally{connecting=false;button('connect-button').disabled=false;setLobbyMode(lobbyMode);}
}
function startBot(){
 audio.unlock();epoch++;connecting=false;localGame?.stop();state=null;resetAim();online=true;seat=0;show('lobby',false);
 localGame=new BotGame(
   (balls,shot)=>physics.simulate(balls,shot),position=>physics.chooseBot(position),applySnapshot,
   message=>{sending=false;pendingShot=null;placing=false;toast(errorMessage(message));},
   value=>{angle=value;invalidateGuide();},
 );
 localGame.start();toast('人机对战 · 你先开球。鼠标瞄准，按住 W 松开出杆；手机右侧下拉出杆。');
}
function showModeSelect(){
 show('mode-actions',true);show('friend-panel',false);
 text('lobby-title','选好对手，来一局。');text('lobby-description','独自挑战电脑，或邀请好友联机切磋。绿色球台、双准线与高低杆，随时开打。');
}
function showFriendMode(){
 show('mode-actions',false);show('friend-panel',true);show('lobby-form',networkConfigured);show('friend-unavailable',!networkConfigured);
 text('lobby-title','好友，各自入座。');text('lobby-description','两人各用自己的电脑或手机。创建房间，把邀请码发给好友，即可联机对战。');
}
$('bot-start').onclick=()=>{audio.unlock();tutorial.beforeStart(startBot);};$('friend-start').onclick=()=>tutorial.beforeStart(showFriendMode);$('mode-back').onclick=showModeSelect;
showModeSelect();
document.title='好友八球 · 人机对战与好友联机';
if(demoMode)document.body.classList.add('demo-mode');
if(invite)showFriendMode();
if(networkConfigured)void restore();
