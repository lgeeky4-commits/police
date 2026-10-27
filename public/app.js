'use strict';
const $=id=>document.getElementById(id);
const time=v=>new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const socket=io('/border',{autoConnect:true,reconnection:true});
const state={joined:false,id:null,name:'',roster:[],marks:[],messages:[],history:[],mode:'view',draft:null,firstCorner:null,selected:null,filter:'all',zoom:1,panX:0,panY:0,suppress:false,boardWidth:0,boardHeight:0};
const MAP_ASPECT=222/230;
const CODE={CHECKPOINT:'CP',BLOCK:'BL',OBSERVATION:'OB',PATROL:'PT',NOTE:'N',PHOTO:'PH',VIDEO:'VD',INCIDENT:'!',DISPATCH:'D'};
let toastTimeout=null;
let panMode=false, singleDrag=null, pinch=null, blockClickUntil=0;
const activePointers=new Map();
const safeText=(v,max=200)=>String(v||'').slice(0,max);
const toast=text=>{const el=$('toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.hidden=true,3000)};
const emit=(name,data)=>new Promise((resolve,reject)=>{socket.timeout(7000).emit(name,data,(err,ack)=>{if(err||!ack?.ok)reject(new Error(ack?.error||'Connection timed out.'));else resolve(ack)})});
function renderRoster(){
 $('unitCount').textContent=String(state.roster.length).padStart(2,'0');$('onlineCount').textContent=`${state.roster.length} / 4 ONLINE`;
 const list=$('unitRoster');list.replaceChildren();
 for(const u of state.roster){const row=document.createElement('div');row.className='unit';const n=document.createElement('b');n.textContent=u.name+(u.id===state.id?' / YOU':'');const status=document.createElement('small');status.textContent=u.status;row.append(n,status);list.append(row)}
 for(let i=state.roster.length;i<4;i++){const row=document.createElement('div');row.className='unit-slot';row.textContent=`SLOT ${String(i+1).padStart(2,'0')} / AWAITING FIELD UNIT`;list.append(row)}
 const mine=state.roster.find(u=>u.id===state.id);if(mine)$('unitStatus').value=mine.status;
}
function buildMediaElement(media){
 if(!media||typeof media.data!=='string')return null;
 const photo=media.kind==='photo';
 const mime=media.mime||'';
 if(photo&&!['image/jpeg','image/png','image/webp'].includes(mime))return null;
 if(!photo&&!['video/webm','video/mp4'].includes(mime))return null;
 const node=document.createElement(photo?'img':'video');
 node.src=media.data;
 if(photo){node.alt='Photo shared in Border Control room';node.loading='lazy'}
 else {node.controls=true;node.preload='metadata';node.playsInline=true;node.setAttribute('aria-label','Shared roleplay video');}
 return node;
}
function appendMessage(m){
 const wrap=document.createElement('div');wrap.className='message'+(m.kind==='media'?' media-message':'');
 const head=document.createElement('b');head.textContent=m.name+': ';
 const timeEl=document.createElement('time');timeEl.textContent=time(m.time);
 wrap.append(head);
 if(m.kind==='media'){
  const kind=m.media?.kind==='photo'?'PHOTO':'VIDEO';const label=document.createElement('div');label.className='media-caption';label.textContent=`${kind} / BROWSER CAPTURE`;
  const box=document.createElement('div');box.className='media-entry';box.append(label);const node=buildMediaElement(m.media);if(node)box.append(node);wrap.append(box);
 }else{wrap.append(document.createTextNode(m.text||''));}
 wrap.append(timeEl);$('chat').append(wrap);$('chat').scrollTop=$('chat').scrollHeight;
}
function renderChat(){const el=$('chat');el.replaceChildren();if(!state.messages.length){const d=document.createElement('div');d.className='empty';d.textContent='No field messages yet.';el.append(d)}else state.messages.forEach(appendMessage)}
function renderHistory(){const el=$('activityList');el.replaceChildren();if(!state.history.length){const d=document.createElement('div');d.className='empty';d.textContent='No map changes yet.';el.append(d)}else [...state.history].reverse().slice(0,16).forEach(h=>{const d=document.createElement('div');d.className='activity';const b=document.createElement('b');b.textContent=`${time(h.time)} / ${h.action}`;d.append(b,document.createTextNode(` — ${h.name}: ${h.label}`));el.append(d)})}
function percent(n){return Math.max(0,Math.min(100,n))+'%'}
function renderMap(){
 const pins=$('markerLayer'),zones=$('areaLayer');pins.replaceChildren();zones.replaceChildren();
 for(const item of state.marks){if(item.kind==='zone'){
  const node=document.createElement('div');node.className='zone';node.dataset.mapTime=String(item.time);node.style.left=percent(item.x1);node.style.top=percent(item.y1);node.style.width=percent(item.x2-item.x1);node.style.height=percent(item.y2-item.y1);node.title=item.label;
  node.setAttribute('role','button');node.tabIndex=0;node.setAttribute('aria-label',`${item.label} / ${time(item.time)}`);node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showDetail(item.id)}});node.addEventListener('click',e=>{e.stopPropagation();showDetail(item.id)});zones.append(node)
 }else{
  const isMajor=item.priority==='major'||item.type==='DISPATCH'||item.type==='INCIDENT'||(!item.priority&&!['NOTE','PHOTO','VIDEO'].includes(item.type));
  const node=document.createElement('button');node.type='button';node.className='pin '+(isMajor?'major-pin ':'small-pin ')+(item.type==='DISPATCH'?'dispatch-pin':'');
  node.dataset.type=item.type;node.dataset.mapTime=String(item.time);node.style.left=percent(item.x);node.style.top=percent(item.y);
  // Compact symbol only; full details remain in the popup, map list, and incident search.
  if(isMajor){const glyph=document.createElement('span');glyph.className='pin-glyph';glyph.textContent=CODE[item.type]||'!';node.append(glyph)}
  else {node.textContent=CODE[item.type]||'N';}
  node.title=`${item.label} / ${time(item.time)}`;
  node.setAttribute('aria-label',`${item.type}: ${item.label} / ${time(item.time)}`);
  node.addEventListener('click',e=>{e.stopPropagation();showDetail(item.id)});pins.append(node)
 }}
 $('itemCount').textContent=String(state.marks.length);
 const list=$('itemList');list.replaceChildren();const selected=state.marks.filter(m=>state.filter==='all'||(state.filter==='zone'?m.kind==='zone':m.kind==='point'));
 if(!selected.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No matching map marks.';list.append(empty)}
 for(const item of [...selected].reverse()){
  const b=document.createElement('button');b.className='list-item';b.type='button';const a=document.createElement('b');a.textContent=item.label;const desc=document.createElement('small');desc.textContent=`${item.type} · ${time(item.time)}`;b.append(a,desc);b.addEventListener('click',()=>showDetail(item.id));list.append(b)
 }
}
// Zoom and pan the entire board as one layer so marks, paths, media, and arrows
// stay attached to the same reference-map coordinates.
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
function layoutMapBoard(){
 const viewport=$('mapViewport');
 const board=$('mapBoard');
 const vw=viewport.clientWidth||0, vh=viewport.clientHeight||0;
 if(!vw||!vh)return;
 let w=vw, h=w/MAP_ASPECT;
 if(h>vh){h=vh;w=h*MAP_ASPECT;}
 state.boardWidth=w; state.boardHeight=h;
 board.style.width=`${w}px`;
 board.style.height=`${h}px`;
 board.style.left=`${Math.round((vw-w)/2)}px`;
 board.style.top=`${Math.round((vh-h)/2)}px`;
}
function constrainPan(){
 const viewport=$('mapViewport');
 const extraX=Math.max(0,state.zoom*state.boardWidth-viewport.clientWidth);
 const extraY=Math.max(0,state.zoom*state.boardHeight-viewport.clientHeight);
 const limitX=extraX/2, limitY=extraY/2;
 state.panX=clamp(state.panX,-limitX,limitX);
 state.panY=clamp(state.panY,-limitY,limitY);
}
function applyZoom(){
 layoutMapBoard();
 constrainPan();
 $('mapBoard').style.transform=`translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
 $('zoomLabel').textContent=Math.round(state.zoom*100)+'%';
 $('mapViewport').classList.toggle('can-pan',state.zoom>1);
 $('mapViewport').classList.toggle('pan-mode',panMode);
 $('mapViewport').classList.toggle('show-small-marks',state.zoom>=1.7);
}
function setZoom(v,clientX,clientY){
 const before=state.zoom;
 const next=Math.round(clamp(v,1,5)*100)/100;
 if(before!==next&&Number.isFinite(clientX)&&Number.isFinite(clientY)){
  const box=$('mapViewport').getBoundingClientRect();
  const x=clientX-box.left-box.width/2;
  const y=clientY-box.top-box.height/2;
  const ratio=next/before;
  state.panX-=(ratio-1)*(x-state.panX);
  state.panY-=(ratio-1)*(y-state.panY);
 }
 state.zoom=next;
 if(next===1){state.panX=0;state.panY=0}
 applyZoom();
}
function canPan(){return state.zoom>1 && (panMode || (state.mode==='view'&&!window.BorderLive?.active?.()))}
function setPanMode(value){
 panMode=!!value;
 if(panMode){setMode('view');window.BorderLive?.stop?.()}
 const button=$('panToggle');button.classList.toggle('selected',panMode);
 button.setAttribute('aria-pressed',String(panMode));button.textContent=panMode?'PAN ON':'PAN MAP';
 if(panMode){$('mapFeedback').textContent='PAN MODE / DRAG MAP TO MOVE';}
 applyZoom();
}
window.BorderPan={deactivate:()=>setPanMode(false),active:()=>panMode};
function setMode(mode){
 if(mode!=='view'&&panMode){panMode=false;const toggle=$('panToggle');toggle.classList.remove('selected');toggle.setAttribute('aria-pressed','false');toggle.textContent='PAN MAP';applyZoom()}
 state.mode=mode;state.firstCorner=null;state.draft=null;
 for(const b of document.querySelectorAll('[data-mode]'))b.classList.toggle('selected',b.dataset.mode===mode);
 const help=mode==='view'?'VIEW MODE / SELECT EXISTING MARKS':mode==='zone'?'BLOCK AREA / TAP TWO CORNERS':mode==='media'?'MEDIA REPORT / TAP MAP TO ATTACH':' '+`${mode} / TAP A LOCATION`;
 $('toolHelp').textContent=help+'. This is a fictional roleplay reference map.';$('mapFeedback').textContent=help;$('mapStatus').textContent=help;
}
function mapCoords(ev){const box=$('mapBoard').getBoundingClientRect();return{x:Math.round(Math.max(0,Math.min(100,(ev.clientX-box.left)/box.width*100))*100)/100,y:Math.round(Math.max(0,Math.min(100,(ev.clientY-box.top)/box.height*100))*100)/100}}
function openEditor(data){state.draft=data;const title=data.kind==='zone'?'BLOCK AREA':data.kind==='media'?'MEDIA REPORT':data.type;$('editorTitle').textContent='NEW '+title;$('editorCoords').textContent=data.kind==='zone'?`START X ${data.x1.toFixed(1)} / Y ${data.y1.toFixed(1)} → END X ${data.x2.toFixed(1)} / Y ${data.y2.toFixed(1)}`:`MAP X ${data.x.toFixed(1)} / Y ${data.y.toFixed(1)}`;
 $('markLabel').value=data.type==='DISPATCH'?'UNIT ASSISTANCE REQUESTED':data.type==='INCIDENT'?'LARGE INCIDENT / DISTURBANCE':data.kind==='zone'?'Blocked Area':data.kind==='media'?`${data.type==='PHOTO'?'Photo':'Video'} Report`:data.type==='NOTE'?'Small Report':data.type[0]+data.type.slice(1).toLowerCase()+' A';$('markPriority').value=data.kind==='media'||data.type==='NOTE'?'small':'major';$('markPriority').disabled=['DISPATCH','INCIDENT'].includes(data.type);$('markNote').value='';$('editorOverlay').hidden=false;$('markLabel').focus()}
function handleMapClick(ev){if(state.suppress){state.suppress=false;return}if(state.mode==='view'||!state.joined)return;
 const p=mapCoords(ev);$('coords').textContent=`X ${p.x.toFixed(1)} / Y ${p.y.toFixed(1)}`;
 if(state.mode==='media'){
  const media=window.BCMedia?.pending();if(!media){toast('Capture a photo or video first.');setMode('view');return}
  openEditor({kind:'media',type:media.kind==='photo'?'PHOTO':'VIDEO',x:p.x,y:p.y,media});return;
 }
 if(state.mode==='zone'){
  if(!state.firstCorner){state.firstCorner=p;toast('First corner saved. Tap the second corner.');$('mapFeedback').textContent=`BLOCK AREA / CORNER 1 (${p.x.toFixed(1)},${p.y.toFixed(1)})`;return}
  const first=state.firstCorner;state.firstCorner=null;openEditor({kind:'zone',x1:first.x,y1:first.y,x2:p.x,y2:p.y});return;
 }
 openEditor({kind:'point',type:state.mode,x:p.x,y:p.y});
}
function closeEditor(){$('editorOverlay').hidden=true;state.draft=null}
async function saveEditor(){if(!state.draft)return;
 const d=state.draft;const label=safeText($('markLabel').value,70).trim(),note=safeText($('markNote').value,240).trim(),priority=$('markPriority').value;
 if(!label){toast('Add a label for the map mark.');return}
 $('editorSave').disabled=true;
 try{await emit(d.type==='DISPATCH'?'border:dispatch':d.kind==='zone'?'border:zone':d.kind==='media'?'border:mediaMark':'border:mark',{...d,label,note,priority});if(d.kind==='media'){window.BCMedia?.clearPending();setMode('view')}closeEditor();toast('Shared with Border Control field room.')}catch(error){toast(error.message)}finally{$('editorSave').disabled=false}
}
function showDetail(id){const item=state.marks.find(m=>m.id===id);if(!item)return;
 state.selected=id;$('detailTitle').textContent=item.label;$('detailInfo').replaceChildren();
 for(const text of [`TYPE: ${item.type}`,`IMPORTANCE: ${item.priority==='major'||item.type==='DISPATCH'?'LARGE / IMPORTANT':'SMALL / ZOOM IN'}`,`CREATED: ${new Date(item.time).toLocaleString()}`,`CREATOR: ${item.name}`,item.kind==='zone'?`BLOCK AREA X ${item.x1.toFixed(1)}–${item.x2.toFixed(1)} / Y ${item.y1.toFixed(1)}–${item.y2.toFixed(1)}`:`MAP LOCATION X ${item.x.toFixed(1)} / Y ${item.y.toFixed(1)}`]){
  const d=document.createElement('p');d.textContent=text;$('detailInfo').append(d)
 }
 $('detailText').textContent=item.note||'No additional notes.';const mediaBox=$('detailMedia');mediaBox.replaceChildren();if(item.kind==='media'){const node=buildMediaElement(item.media);if(node)mediaBox.append(node)}$('removeMark').hidden=item.owner!==state.id;$('detailOverlay').hidden=false;window.CreatorDossier?.open(item);
}
function closeDetail(){$('detailOverlay').hidden=true;state.selected=null;window.CreatorDossier?.close();}
async function removeDetail(){if(!state.selected)return;try{await emit('border:remove',{id:state.selected});closeDetail();toast('Marker removed.')}catch(e){toast(e.message)}}
function onJoined(data){state.joined=true;state.id=data.id;state.roster=data.roster||[];state.marks=data.marks||[];state.messages=data.messages||[];state.history=data.history||[];$('joinOverlay').hidden=true;$('app').hidden=false;renderRoster();renderMap();renderChat();renderHistory();window.BCMedia?.onRadioState(data.radio||{active:false})}
function joinRoom(){const name=$('joinName').value.trim();if(name.length<2){$('joinError').textContent='Enter a callsign with at least 2 characters.';return}
 $('joinBtn').disabled=true;$('joinError').textContent='';socket.timeout(7000).emit('border:join',{name},(err,data)=>{ $('joinBtn').disabled=false;if(err||!data?.ok){$('joinError').textContent=data?.error||'Connection unavailable.';return}state.name=name;onJoined(data) })}
function bind(){
 $('joinBtn').onclick=joinRoom;$('joinName').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom()});
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
 $('cancelTool').onclick=()=>setMode('view');$('mapBoard').addEventListener('click',handleMapClick);
 $('zoomIn').onclick=()=>setZoom(state.zoom+.35);
 $('zoomOut').onclick=()=>setZoom(state.zoom-.35);
 $('zoomReset').onclick=()=>{state.panX=0;state.panY=0;setZoom(1)};
 $('panToggle').onclick=()=>setPanMode(!panMode);
 const viewport=$('mapViewport');
 viewport.addEventListener('wheel',e=>{e.preventDefault();setZoom(state.zoom+(e.deltaY<0?.18:-.18),e.clientX,e.clientY)},{passive:false});
 // Intercept the click after a drag/pinch before live-mark handlers receive it.
 viewport.addEventListener('click',e=>{
  if(performance.now()<blockClickUntil){blockClickUntil=0;state.suppress=false;e.preventDefault();e.stopImmediatePropagation()}
 },true);
 viewport.addEventListener('pointerdown',e=>{
  if(!state.joined||e.button!==0&&e.pointerType==='mouse')return;
  if(e.target.closest('button,.pin,.zone,input'))return;
  activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(activePointers.size===2||canPan()){try{viewport.setPointerCapture(e.pointerId)}catch{}}
  if(activePointers.size===2){
   for(const id of activePointers.keys()){try{viewport.setPointerCapture(id)}catch{}}
   const [a,b]=[...activePointers.values()];
   pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:state.zoom,
    midX:(a.x+b.x)/2,midY:(a.y+b.y)/2};
   singleDrag=null;blockClickUntil=performance.now()+500;
  }else if(activePointers.size===1&&canPan()){
   singleDrag={id:e.pointerId,x:e.clientX,y:e.clientY,px:state.panX,py:state.panY,moved:false};
  }
 });
 viewport.addEventListener('pointermove',e=>{
  if(activePointers.has(e.pointerId))activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&activePointers.size>=2){
   const [a,b]=[...activePointers.values()];
   const centerX=(a.x+b.x)/2,centerY=(a.y+b.y)/2;
   const distance=Math.hypot(a.x-b.x,a.y-b.y);
   const target=pinch.zoom*distance/pinch.distance;
   setZoom(target,centerX,centerY);
   state.panX+=centerX-pinch.midX;state.panY+=centerY-pinch.midY;
   pinch.midX=centerX;pinch.midY=centerY;applyZoom();
   blockClickUntil=performance.now()+650;
  }else if(singleDrag?.id===e.pointerId&&canPan()){
   const dx=e.clientX-singleDrag.x,dy=e.clientY-singleDrag.y;
   if(Math.hypot(dx,dy)>4)singleDrag.moved=true;
   if(singleDrag.moved){state.panX=singleDrag.px+dx;state.panY=singleDrag.py+dy;applyZoom();blockClickUntil=performance.now()+500}
  }else if(!activePointers.size){const p=mapCoords(e);$('coords').textContent=`X ${p.x.toFixed(1)} / Y ${p.y.toFixed(1)}`}
 });
 function endGesture(e){
  if(singleDrag?.id===e.pointerId&&singleDrag.moved){blockClickUntil=performance.now()+550;state.suppress=true}
  if(pinch)blockClickUntil=performance.now()+650;
  activePointers.delete(e.pointerId);try{viewport.releasePointerCapture(e.pointerId)}catch{}
  if(activePointers.size<2)pinch=null;
  singleDrag=null;
 }
 viewport.addEventListener('pointerup',endGesture);
 viewport.addEventListener('pointercancel',endGesture);
 window.addEventListener('resize',()=>{layoutMapBoard();applyZoom();});
 $('editorClose').onclick=closeEditor;$('editorCancel').onclick=closeEditor;$('editorSave').onclick=saveEditor;$('detailClose').onclick=closeDetail;$('detailDone').onclick=closeDetail;$('removeMark').onclick=removeDetail;
 $('unitStatus').onchange=()=>emit('border:status',{status:$('unitStatus').value}).catch(e=>toast(e.message));
 $('chatForm').onsubmit=async e=>{e.preventDefault();const text=$('chatInput').value.trim();if(!text)return;$('chatInput').value='';try{await emit('border:message',{text})}catch(e){toast(e.message)}};
 document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{state.filter=btn.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b===btn));renderMap()}));
 for(const id of ['editorOverlay','detailOverlay'])$(id).addEventListener('click',e=>{if(e.target===e.currentTarget)(id==='editorOverlay'?closeEditor:closeDetail)()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeEditor();closeDetail()}});
 socket.on('border:roster',r=>{state.roster=r;renderRoster()});
 socket.on('border:mark',m=>{if(!state.marks.some(x=>x.id===m.id))state.marks.push(m);renderMap()});
 socket.on('border:remove',d=>{state.marks=state.marks.filter(m=>m.id!==d.id);renderMap()});
 socket.on('border:message',m=>{state.messages.push(m);if(state.messages.length>120)state.messages.shift();$('chat').querySelector('.empty')?.remove();appendMessage(m)});
 socket.on('border:history',h=>{state.history.push(h);if(state.history.length>60)state.history.shift();renderHistory()});
 socket.on('disconnect',()=>{if(state.joined)toast('Connection lost. Reconnecting…')});
 socket.on('connect',()=>{if(state.joined){socket.timeout(7000).emit('border:join',{name:state.name},(err,data)=>{if(!err&&data?.ok){onJoined(data);toast('Reconnected to field room.')}else if(!err){state.joined=false;$('joinOverlay').hidden=false;$('app').hidden=true;$('joinError').textContent=data?.error||'Rejoin required.'}})}});
}
bind();setMode('view');layoutMapBoard();applyZoom();
