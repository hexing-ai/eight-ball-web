import './tutorial.css';

const steps = [
  { title:'先瞄准，再微调', body:'电脑移动鼠标瞄准；手机拖动桌面或球杆转向。左侧微调条上下滑动，让角度更精准。', hint:'金线看目标球，蓝线看白球；短线只提示方向。', art:'aim' },
  { title:'蓄力，松手出杆', body:'电脑按住 W 蓄力，松开立即击球；手机向下拉右侧力度杆，松手出杆。', hint:'取消出杆：电脑按 Esc；手机把力度杆拉回起点。', art:'power' },
  { title:'试试高杆和低杆', body:'点右侧白球上方打高杆、下方打低杆。高杆更容易跟进，低杆更容易回拉。', hint:'刚开始用中杆和适中力度，更容易掌握走位。', art:'spin' },
  { title:'最后，才轮到黑八', body:'分组后，先清完自己的全色球或花色球，再打黑八。提前打进黑八会输掉本局。', hint:'犯规后对手获得自由球：拖动白球放好，再点确认。', art:'rules' },
] as const;
const drawings: Record<string,string> = {
  aim:'<path d="M30 116L117 90" stroke="#d7b783" stroke-width="8"/><path d="M143 82L208 63" stroke="#f4f0e5" stroke-width="2" stroke-dasharray="4 5"/><path d="M228 60L282 44" stroke="#ffce4c" stroke-width="3"/><path d="M208 70L225 115" stroke="#8cdceb" stroke-width="3" stroke-dasharray="5 5"/><circle cx="134" cy="85" r="13" fill="#f4f0e5"/><circle cx="222" cy="59" r="13" fill="#e9ae15"/>',
  power:'<rect x="75" y="40" width="65" height="65" rx="10" fill="#15211f" stroke="#c9a36d"/><text x="107" y="84" text-anchor="middle" fill="#f4f0e5" font-size="30">W</text><rect x="211" y="20" width="27" height="110" rx="7" fill="#10201b" stroke="#c9a36d"/><rect x="217" y="72" width="15" height="50" rx="3" fill="#c9a36d"/><path d="M263 35V104m-7-8 7 8 7-8" stroke="#f4f0e5" fill="none" stroke-width="3"/>',
  spin:'<circle cx="165" cy="75" r="52" fill="#eae6d6"/><path d="M165 28V122M118 75H212" stroke="#9c9787"/><circle cx="165" cy="75" r="6" fill="#b62829"/><circle cx="165" cy="43" r="5" fill="none" stroke="#b62829"/><circle cx="165" cy="107" r="5" fill="none" stroke="#b62829"/><text x="234" y="48" fill="#f4f0e5" font-size="13">高杆</text><text x="234" y="111" fill="#f4f0e5" font-size="13">低杆</text>',
  rules:'<circle cx="82" cy="75" r="25" fill="#e9ae15"/><circle cx="153" cy="75" r="25" fill="#f4f0e5"/><path d="M130 64H176V86H130Z" fill="#245bb9"/><path d="M192 75H225m-7-7 7 7-7 7" fill="none" stroke="#c9a36d" stroke-width="2"/><circle cx="265" cy="75" r="25" fill="#0b1013"/><circle cx="265" cy="75" r="12" fill="#f4f0e5"/><text x="265" y="81" text-anchor="middle" fill="#15211f" font-size="17">8</text>',
};

export class Tutorial {
  private dialog=document.createElement('dialog');
  private step=0;
  private seen=false;
  private continuation:(()=>void)|undefined;
  private returnFocus:HTMLElement|null=null;
  get open(){return this.dialog.open;}
  constructor(private onChange:()=>void,private inMatch:()=>boolean){
    this.dialog.id='tutorial';
    this.dialog.setAttribute('aria-labelledby','tutorial-title');
    this.dialog.innerHTML=`<div class="tutorial-head"><span id="tutorial-progress"></span><button id="tutorial-skip" class="text-button" type="button">跳过引导</button></div><div class="tutorial-layout"><div id="tutorial-art" aria-hidden="true"></div><div class="tutorial-copy" aria-live="polite"><h2 id="tutorial-title"></h2><p id="tutorial-body"></p><p id="tutorial-hint"></p></div></div><p id="tutorial-note"></p><div class="tutorial-actions"><button id="tutorial-prev" class="outline-button" type="button">上一步</button><button id="tutorial-next" class="gold-button" type="button">下一步</button></div>`;
    document.body.append(this.dialog);
    this.el('tutorial-skip').onclick=()=>this.dialog.close();
    this.el('tutorial-prev').onclick=()=>{if(this.step>0){this.step--;this.render();}};
    this.el('tutorial-next').onclick=()=>{if(this.step===steps.length-1)this.dialog.close();else{this.step++;this.render();}};
    this.dialog.addEventListener('close',()=>{
      this.seen=true;
      try{localStorage.setItem('eightball-tutorial-v1','seen');}catch{/* Optional preference. */}
      const next=this.continuation;this.continuation=undefined;
      this.onChange();next?.();
      if(!next&&this.returnFocus?.getClientRects().length)this.returnFocus.focus();
      else if(next)document.getElementById('table')?.focus();
    });
  }
  private el(id:string){return this.dialog.querySelector<HTMLElement>(`#${id}`)!;}
  beforeStart(next:()=>void){
    try{this.seen ||= localStorage.getItem('eightball-tutorial-v1')==='seen';}catch{/* Still skippable with storage blocked. */}
    if(this.seen)next();else this.show(next);
  }
  show(next?:()=>void){
    if(this.open)return;
    this.continuation=next;this.step=0;this.returnFocus=document.activeElement as HTMLElement;
    this.render();this.dialog.showModal();this.onChange();this.el('tutorial-next').focus();
  }
  private render(){
    const step=steps[this.step];
    this.el('tutorial-progress').textContent=`新手引导 · ${this.step+1} / ${steps.length}`;
    this.el('tutorial-title').textContent=step.title;this.el('tutorial-body').textContent=step.body;
    this.el('tutorial-hint').textContent=step.hint;
    this.el('tutorial-art').innerHTML=`<svg viewBox="0 0 330 150" xmlns="http://www.w3.org/2000/svg">${drawings[step.art]}</svg>`;
    (this.el('tutorial-prev') as HTMLButtonElement).disabled=this.step===0;
    this.el('tutorial-next').textContent=this.step===steps.length-1?(this.continuation?'开始体验':'完成引导'):'下一步';
    this.el('tutorial-note').textContent=this.inMatch()?'当前对局计时继续，可随时跳过返回球台。':'随时可跳过，以后在菜单中重新查看。';
  }
}
