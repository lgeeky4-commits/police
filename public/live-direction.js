'use strict';
/* Fictional shared moving marker & direction arrows, not GPS tracking. */
(() => {
 const layer=document.getElementById('liveDirectionLayer');
 if(!layer||typeof socket==='undefined')return;
 let mode='off',incomingStart=null;
 const tracks=new Map();
 const $=id=>document.getElementById(id);
 const fmt=val=>new Date(val).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
 const status=text=>{$('liveStatus').textContent=text};
 const key=t=>t.owner+':'+t.type;
 const esc=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 function svg(tag,attrs){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));return e}
 function draw(){
  layer.replaceChildren();
  const art=svg('svg',{viewBox:'0 0 1000 1000',preserveAspectRatio:'none','aria-hidden':'true'});
  const defs=svg('defs');
  for(const [mode,color] of [['move','#6be1ff'],['incoming','#ff696e']]){
   const id='border-arrow-'+mode;
   const marker=svg('marker',{id,markerWidth:8,markerHeight:8,refX:6,refY:3,orient:'auto',markerUnits:'userSpaceOnUse'});
   marker.append(svg('path',{d:'M0 0 L6 3 L0 6 Z',fill:color}));defs.append(marker);
  }
  art.append(defs);
  for(const track of tracks.values()){
   if(!Array.isArray(track.points))continue;
   const col=track.type==='incoming'?'#ff696e':'#6be1ff';
   for(let i=1;i<track.points.length;i++){
    const a=track.points[i-1],b=track.points[i];
    const line=svg('line',{x1:a.x*10,y1:a.y*10,x2:b.x*10,y2:b.y*10,stroke:col,'stroke-width':track.type==='incoming'?2.2:1.8,'stroke-dasharray':track.type==='incoming'?'9 6':'none','marker-end':`url(#border-arrow-${track.type})`,opacity:.94});
    art.append(line);
   }
  }
  layer.append(art);
  for(const track of tracks.values()){
   const p=track.points?.at(-1);if(!p)continue;
   const tag=document.createElement('div');tag.className='live-dot '+(track.type==='incoming'?'incoming':'');
   tag.style.left=p.x+'%';tag.style.top=p.y+'%';tag.textContent=(track.type==='incoming'?'INCOMING / ':'MOVE / ')+track.name+' · '+fmt(track.time);
   layer.append(tag);
  }
 }
 function setLiveMode(next){
  mode=mode===next?'off':next;incomingStart=null;
  if(mode!=='off')window.BorderPan?.deactivate?.();
  ['borderLiveMove','borderLiveIncoming'].forEach((id,i)=>$(id).classList.toggle('active',mode===(i===0?'move':'incoming')));
  $('borderLiveMove').textContent=mode==='move'?'LIVE MARK / ON':'LIVE MARK / OFF';
  setModeBase();
  status(mode==='move'?'LIVE MARK: Tap anywhere to move the dot. Only the newest two arrows remain.':mode==='incoming'?'INCOMING ROUTE: Tap the fictional start position, then its destination.':'Tap LIVE MARK or INCOMING ROUTE. Shared game markers only.');
 }
 function setModeBase(){
  if(mode!=='off'&&typeof setMode==='function')setMode('view');
 }
 $('borderLiveMove').onclick=()=>setLiveMode('move');
 $('borderLiveIncoming').onclick=()=>setLiveMode('incoming');
 $('borderLiveClear').onclick=async()=>{
  if(!state.joined)return toast('Join the field room first.');
  for(const type of ['move','incoming'])try{await emit('border:live:clear',{type})}catch(e){toast(e.message)}
  incomingStart=null;status('Your moving mark and incoming route were cleared.');
 };
 $('mapBoard').addEventListener('click',async e=>{
  if(mode==='off'||!state.joined)return;
  // Stop the regular checkpoint/area handler from creating an unwanted mark.
  e.stopImmediatePropagation(); e.preventDefault();
  const p=mapCoords(e);
  if(mode==='move'){
   try{await emit('border:live:move',p);status(`LIVE MARK MOVED / X ${p.x.toFixed(1)} Y ${p.y.toFixed(1)}`)}catch(err){toast(err.message)}
   return;
  }
  if(!incomingStart){incomingStart=p;status('INCOMING ROUTE: Start selected. Tap the simulated destination.');return;}
  const start=incomingStart;incomingStart=null;
  try{await emit('border:live:incoming',{points:[start,p]});status('Fictional incoming path shared with your room. Tap again for another path.');}
  catch(err){toast(err.message)}
 },true);
 socket.on('border:live:update',track=>{if(!track?.owner||!['move','incoming'].includes(track.type))return;tracks.set(key(track),track);draw()});
 socket.on('border:live:remove',data=>{tracks.delete(key(data));draw()});
 // Join/rejoin snapshots are delivered through border:join, which app.js handles.
 const existingJoin=typeof onJoined==='function'?onJoined:null;
 if(existingJoin){
  // App's onJoined is lexical, cannot be replaced reliably. A socket acknowledgement
  // is read via the join buttons' existing callback; use a dedicated snapshot event.
 }
 socket.on('border:live:snapshot',items=>{tracks.clear();for(const t of items||[])if(t?.owner)tracks.set(key(t),t);draw()});
 // Late join: fetch latest tracks after the existing join callback has completed.
 let priorJoined=false;
 setInterval(()=>{
  if(state.joined&&!priorJoined){priorJoined=true;socket.timeout(5000).emit('border:live:list',{},(err,r)=>{if(!err&&r?.ok){tracks.clear();for(const t of r.tracks||[])tracks.set(key(t),t);draw()}})}
  if(!state.joined)priorJoined=false;
 },450);
 window.BorderLive={active:()=>mode!=='off',stop:()=>{if(mode!=='off')setLiveMode('off')}};
 socket.on('connect',()=>{tracks.clear();draw();priorJoined=false;});
})();
