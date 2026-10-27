"use strict";
/* Fictional case numbers and two-person confirmation, bound to Border Control room. */
(() => {
 const q=id=>document.getElementById(id);
 let completed=[];
 const itemList=q('itemList');if(!itemList)return;
 const host=document.createElement('section');host.className='case-lookup';
 host.innerHTML='<label for="borderCaseSearch">INCIDENT NUMBER / MARK SEARCH</label><input id="borderCaseSearch" type="search" placeholder="BC-2026-0001 or incident name" autocomplete="off"><div id="borderCaseResults" class="case-results" aria-live="polite"></div><div class="case-help">Select a case to inspect it. Completed cases stay searchable until server restart.</div>';
 itemList.before(host);
 const request=document.createElement('button');request.id='borderMissionRequest';request.type='button';request.textContent='REQUEST MISSION CONFIRMATION';request.className='mission-request';
 const confirm=document.createElement('button');confirm.id='borderMissionConfirm';confirm.type='button';confirm.textContent='CONFIRM MISSION / REMOVE MARK';confirm.className='mission-confirm';
 const status=document.createElement('p');status.id='borderMissionStatus';status.className='mission-status';
 const buttons=document.createElement('div');buttons.className='mission-actions';buttons.append(status,request,confirm);
 q('detailText').after(buttons);
 function updateDetails(){
  const item=state.marks.find(m=>m.id===state.selected);
  if(!item){buttons.hidden=true;return;}
  buttons.hidden=false;
  const line=`${item.number||'BC-UNNUMBERED'} / ${item.missionRequestedBy?`AWAITING APPROVAL FROM A SECOND PLAYER (${item.missionRequestedName})`:'ACTIVE'}`;
  status.textContent=line;
  request.hidden=item.owner!==state.id || !!item.missionRequestedBy;
  confirm.hidden=!item.missionRequestedBy || item.owner===state.id || item.missionRequestedBy===state.id;
 }
 const baseShow=showDetail;
 showDetail=function(id){baseShow(id);updateDetails();};
 const baseRender=renderMap;
 renderMap=function(){baseRender();refreshSearch();};
 const baseJoined=onJoined;
 onJoined=function(data){completed=Array.isArray(data.completed)?data.completed:[];baseJoined(data);refreshSearch();};
 request.addEventListener('click',async()=>{
  if(!state.selected)return;
  try{await emit('border:mission:request',{id:state.selected});toast('Request sent. A different player must confirm it.');}
  catch(e){toast(e.message)}
 });
 confirm.addEventListener('click',async()=>{
  if(!state.selected)return;
  try{const result=await emit('border:mission:confirm',{id:state.selected});closeDetail();toast(`Mission ${result.number} confirmed. Map mark removed.`)}
  catch(e){toast(e.message)}
 });
 function refreshSearch(){
  const term=q('borderCaseSearch').value.trim().toLowerCase(),box=q('borderCaseResults');box.replaceChildren();
  if(!term)return;
  const active=state.marks.filter(m=>`${m.number||''} ${m.label} ${m.note||''}`.toLowerCase().includes(term)).slice(0,12);
  const older=completed.filter(m=>`${m.number} ${m.label}`.toLowerCase().includes(term)).slice(-8).reverse();
  for(const item of active){
   const b=document.createElement('button');b.type='button';b.textContent=`${item.number||'BC-UNNUMBERED'} / ${item.label}${item.missionRequestedBy?' / AWAITING CONFIRMATION':''}`;
   b.onclick=()=>showDetail(item.id);box.append(b);
  }
  for(const item of older){const p=document.createElement('div');p.className='case-archived';p.textContent=`${item.number} / ${item.label} / CONFIRMED BY ${item.confirmedBy}`;box.append(p)}
  if(!active.length&&!older.length){const p=document.createElement('p');p.textContent='No matching incidents in this room.';box.append(p)}
 }
 q('borderCaseSearch').addEventListener('input',refreshSearch);
 socket.on('border:mission:updated',d=>{
  const item=state.marks.find(m=>m.id===d.id);if(!item)return;
  Object.assign(item,d);renderMap();if(item.id===state.selected)updateDetails();
  if(item.owner!==state.id)toast(`${item.number||'CASE'}: Mission confirmation requested.`);
 });
 socket.on('border:mission:completed',d=>{
  if(!completed.some(m=>m.id===d.id))completed.push(d);
  if(state.selected===d.id)closeDetail();
  refreshSearch();toast(`${d.number}: Mission confirmed by ${d.confirmedBy}.`);
 });
 socket.on('border:remove',d=>{if(state.selected===d.id)closeDetail();});
})();
