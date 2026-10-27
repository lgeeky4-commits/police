'use strict';
/** Border Control is a fictional roleplay room. It does not track real devices or people. */
const crypto=require('crypto');
const MAX=4;
const TYPES=new Set(['CHECKPOINT','BLOCK','OBSERVATION','PATROL','NOTE','INCIDENT']);
const STATUSES=new Set(['AVAILABLE','PATROL','AT POST','OBSERVING']);
const MIME_LIMITS={'image/jpeg':1100000,'image/webp':1100000,'image/png':1100000,'video/webm':2200000,'video/mp4':2200000};
function checkedMedia(data){
  const kind=data?.kind;
  const uri=data?.data;
  if(!['photo','video'].includes(kind)||typeof uri!=='string')throw Error('Choose a photo or video.');
  const m=/^data:(image\/(?:jpeg|webp|png)|video\/(?:webm|mp4));base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
  if(!m)throw Error('Unsupported media format.');
  const mime=m[1];if((kind==='photo')!==mime.startsWith('image/'))throw Error('Media type mismatch.');
  if(m[2].length>Math.ceil(MIME_LIMITS[mime]*4/3)+16)throw Error('Media exceeds maximum size.');
  const bytes=Buffer.from(m[2],'base64');
  if(bytes.length>MIME_LIMITS[mime]||bytes.length<64)throw Error('Media is too large or empty.');
  const signature=bytes.subarray(0,16);
  const valid=mime==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8 ||
    mime==='image/png'&&signature.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ||
    mime==='image/webp'&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP' ||
    mime==='video/webm'&&signature.subarray(0,4).equals(Buffer.from('1a45dfa3','hex')) ||
    mime==='video/mp4'&&bytes.toString('ascii',4,8)==='ftyp';
  if(!valid)throw Error('File does not match media format.');
  return {kind,mime,data:uri,size:bytes.length};
}

const safe=(v,n=140)=>String(v??'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,n);
const inRange=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100;
const priorityOf=v=>v==='major'?'major':'small';
const id=()=>crypto.randomBytes(8).toString('hex');
module.exports=function installBorder(io){
  const ns=io.of('/border');
  const users=new Map(),marks=[],messages=[],history=[],completed=[];
  let incidentSequence=0;
  const incidentNumber=()=>`BC-${new Date().getFullYear()}-${String(++incidentSequence).padStart(4,'0')}`;
  const liveTracks=new Map(); // One moving mark and one fictional incoming route per connected player.
  const privateCalls=new Map(); // Private RP calls, opt-in microphone/camera only.
  function terminatePrivateCall(call,reason='ended'){
    if(!call)return;
    privateCalls.delete(call.id);clearTimeout(call.expiry);
    ns.to(call.from).emit('border:private:ended',{callId:call.id,reason});
    ns.to(call.to).emit('border:private:ended',{callId:call.id,reason});
  }
  function userBusyPrivate(id){return [...privateCalls.values()].some(c=>c.from===id||c.to===id)}
  let activeRadio=null,radioTimeout=null;
  const stopRadio=()=>{
    if(!activeRadio)return;
    activeRadio=null;clearTimeout(radioTimeout);radioTimeout=null;
    ns.emit('border:radio:state',{active:false});
  };
  const roomRadio=()=>activeRadio?{active:true,id:activeRadio.id,name:activeRadio.name}:{active:false};
  const keepMediaBounded=()=>{
    let count=messages.filter(m=>m.kind==='media').length;
    for(let i=0;count>12&&i<messages.length;){
      if(messages[i].kind==='media'){messages.splice(i,1);count--}else i++;
    }
  };

  const push=(arr,item,limit)=>{arr.push(item);if(arr.length>limit)arr.shift();};
  const roster=()=>[...users].map(([socketId,u])=>({id:socketId,name:u.name,status:u.status}));
  const ok=(cb,result)=>{if(typeof cb==='function')cb(result)};
  const sent=new Map();
  const throttle=(s,action,ms=600)=>{const k=s.id+':'+action,t=Date.now(),last=sent.get(k)||0;if(t-last<ms)return false;sent.set(k,t);return true;};
  const change=()=>ns.emit('border:roster',roster());
  ns.on('connection',socket=>{
    socket.on('border:join',(payload,cb)=>{
      if(users.has(socket.id))return ok(cb,{ok:true,id:socket.id,roster:roster(),marks,messages,history,completed,radio:roomRadio(),liveTracks:[...liveTracks.values()]});
      if(users.size>=MAX)return ok(cb,{ok:false,error:'Border Control room is full (4 people).'});
      const name=safe(payload?.name,18);
      if(name.length<2)return ok(cb,{ok:false,error:'Enter a name with at least two characters.'});
      if([...users.values()].some(u=>u.name.toLowerCase()===name.toLowerCase()))return ok(cb,{ok:false,error:'That name is already in use.'});
      users.set(socket.id,{name,status:'AVAILABLE'});
      ok(cb,{ok:true,id:socket.id,roster:roster(),marks,messages,history,completed,radio:roomRadio(),liveTracks:[...liveTracks.values()]});change();
    });
    socket.on('border:private:invite',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join the room first.'});
      if(!throttle(socket,'private',1500))return ok(cb,{ok:false,error:'Wait before calling again.'});
      const to=typeof data?.to==='string'?data.to:'';
      if(!users.has(to)||to===socket.id)return ok(cb,{ok:false,error:'Creator is offline or unavailable.'});
      if(userBusyPrivate(socket.id)||userBusyPrivate(to))return ok(cb,{ok:false,error:'One of you is already in a private call.'});
      const kind=data?.kind==='video'?'video':'audio';
      const call={id:id(),from:socket.id,to,kind,state:'ringing',expiry:null};
      privateCalls.set(call.id,call);
      call.expiry=setTimeout(()=>{if(privateCalls.has(call.id))terminatePrivateCall(call,'Call was not answered.')},30000);
      ns.to(to).emit('border:private:incoming',{callId:call.id,from:socket.id,fromName:u.name,kind,context:safe(data?.context,70)});
      ok(cb,{ok:true,callId:call.id});
    });
    socket.on('border:private:answer',(data,cb)=>{
      const call=privateCalls.get(data?.callId);
      if(!call||call.to!==socket.id||call.state!=='ringing')return ok(cb,{ok:false,error:'Call request not available.'});
      if(data?.accept!==true){terminatePrivateCall(call,'Call declined.');return ok(cb,{ok:true});}
      clearTimeout(call.expiry);call.expiry=null;call.state='active';
      const payload={callId:call.id,from:call.from,to:call.to,kind:call.kind};
      ns.to(call.from).emit('border:private:accepted',payload);
      ns.to(call.to).emit('border:private:accepted',payload);
      ok(cb,{ok:true});
    });
    socket.on('border:private:signal',(data,cb)=>{
      const call=privateCalls.get(data?.callId);
      if(!call||call.state!=='active'||![call.from,call.to].includes(socket.id))return ok(cb,{ok:false,error:'No active call for this player.'});
      const signal=data?.signal;
      if(!signal||typeof signal!=='object'||Array.isArray(signal)||JSON.stringify(signal).length>18000)
        return ok(cb,{ok:false,error:'Invalid call signal.'});
      const to=call.from===socket.id?call.to:call.from;
      ns.to(to).emit('border:private:signal',{callId:call.id,signal});
      ok(cb,{ok:true});
    });
    socket.on('border:private:end',(data,cb)=>{
      const call=privateCalls.get(data?.callId);
      if(!call||![call.from,call.to].includes(socket.id))return ok(cb,{ok:false,error:'Call not found.'});
      terminatePrivateCall(call,'Call ended.');ok(cb,{ok:true});
    });
    socket.on('border:status',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join the room first.'});
      if(!STATUSES.has(data?.status))return ok(cb,{ok:false,error:'Unknown status.'});
      u.status=data.status;change();ok(cb,{ok:true});
    });
    socket.on('border:message',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join the room first.'});
      if(!throttle(socket,'message',250))return ok(cb,{ok:false,error:'Please send messages more slowly.'});
      const text=safe(data?.text,600);if(!text)return ok(cb,{ok:false,error:'Write a message.'});
      const m={id:id(),owner:socket.id,name:u.name,text,time:Date.now()};
      push(messages,m,120);ns.emit('border:message',m);ok(cb,{ok:true});
    });
    socket.on('border:media',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join the room first.'});
      if(!throttle(socket,'media',1800))return ok(cb,{ok:false,error:'Please wait before sharing another clip.'});
      try{
        const media=checkedMedia(data);
        const m={id:id(),kind:'media',owner:socket.id,name:u.name,time:Date.now(),media};
        push(messages,m,120);keepMediaBounded();ns.emit('border:message',m);ok(cb,{ok:true});
      }catch(e){ok(cb,{ok:false,error:e.message})}
    });
    socket.on('border:mediaMark',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join the room first.'});
      if(!throttle(socket,'mark',800))return ok(cb,{ok:false,error:'Wait before another map mark.'});
      if(marks.length>=100)return ok(cb,{ok:false,error:'Map is full; remove an old mark.'});
      if(marks.filter(m=>m.kind==='media').length>=12)return ok(cb,{ok:false,error:'Media map limit reached (12). Remove an old media mark.'});
      if(!inRange(data?.x)||!inRange(data?.y))return ok(cb,{ok:false,error:'Invalid map position.'});
      try{
        const media=checkedMedia(data.media);
        const item={id:id(),number:incidentNumber(),kind:'media',type:media.kind==='photo'?'PHOTO':'VIDEO',priority:priorityOf(data?.priority),x:data.x,y:data.y,label:safe(data?.label,70)||'Media Report',note:safe(data?.note,240),owner:socket.id,name:u.name,time:Date.now(),media};
        marks.push(item);ns.emit('border:mark',item);
        const h={id:id(),time:item.time,action:'MEDIA',label:item.label,name:u.name,type:item.type};push(history,h,60);ns.emit('border:history',h);
        ok(cb,{ok:true,id:item.id});
      }catch(e){ok(cb,{ok:false,error:e.message})}
    });
    socket.on('border:radio:start',(_data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join the room first.'});
      if(activeRadio&&activeRadio.id!==socket.id)return ok(cb,{ok:false,error:`Radio busy: ${activeRadio.name} is speaking.`});
      if(activeRadio?.id===socket.id)return ok(cb,{ok:true,roster:roster()});
      activeRadio={id:socket.id,name:u.name};
      radioTimeout=setTimeout(stopRadio,30000);
      ns.emit('border:radio:state',roomRadio());
      ok(cb,{ok:true,roster:roster()});
    });
    socket.on('border:radio:stop',(_data,cb)=>{
      if(activeRadio?.id===socket.id)stopRadio();ok(cb,{ok:true});
    });
    socket.on('border:radio:signal',(d,cb)=>{
      if(!users.has(socket.id)||!activeRadio)return ok(cb,{ok:false,error:'Radio not active.'});
      if(!d||!users.has(d.to)||d.to===socket.id)return ok(cb,{ok:false,error:'Radio recipient unavailable.'});
      if(d.to!==activeRadio.id&&socket.id!==activeRadio.id)return ok(cb,{ok:false,error:'Radio signal not permitted.'});
      const type=d.type;
      if(!['offer','answer','ice'].includes(type))return ok(cb,{ok:false,error:'Unknown radio signal.'});
      if(type==='offer'&&socket.id!==activeRadio.id || type==='answer'&&socket.id===activeRadio.id)return ok(cb,{ok:false,error:'Radio signal direction invalid.'});
      if(JSON.stringify(d.signal||{}).length>20000)return ok(cb,{ok:false,error:'Radio signal too large.'});
      ns.to(d.to).emit('border:radio:signal',{from:socket.id,type,signal:d.signal});
      ok(cb,{ok:true});
    });
    socket.on('border:live:list',(_data,cb)=>{if(!users.has(socket.id))return ok(cb,{ok:false});ok(cb,{ok:true,tracks:[...liveTracks.values()]});});
    socket.on('border:live:move',(data,cb)=>{
      const u=users.get(socket.id);
      if(!u)return ok(cb,{ok:false,error:'Join Border Control first.'});
      if(!inRange(data?.x)||!inRange(data?.y))return ok(cb,{ok:false,error:'Invalid game-map position.'});
      if(!throttle(socket,'live',180))return ok(cb,{ok:false,error:'Tap a little more slowly.'});
      const key=socket.id+':move';
      const old=liveTracks.get(key);
      const points=(old?.points||[]).concat([{x:data.x,y:data.y}]).slice(-3);
      const track={owner:socket.id,name:u.name,type:'move',points,time:Date.now()};
      liveTracks.set(key,track);ns.emit('border:live:update',track);
      ok(cb,{ok:true,track});
    });
    socket.on('border:live:incoming',(data,cb)=>{
      const u=users.get(socket.id);
      if(!u)return ok(cb,{ok:false,error:'Join Border Control first.'});
      const points=data?.points;
      if(!Array.isArray(points)||points.length!==2||!points.every(p=>inRange(p?.x)&&inRange(p?.y)))
        return ok(cb,{ok:false,error:'Choose two fictional map positions.'});
      const track={owner:socket.id,name:u.name,type:'incoming',points:points.map(p=>({x:p.x,y:p.y})),time:Date.now()};
      liveTracks.set(socket.id+':incoming',track);ns.emit('border:live:update',track);
      const h={id:id(),time:track.time,action:'SIM INCOMING',label:'Fictional movement route',name:u.name,type:'INCOMING'};
      push(history,h,60);ns.emit('border:history',h);
      ok(cb,{ok:true,track});
    });
    socket.on('border:live:clear',(data,cb)=>{
      if(!users.has(socket.id))return ok(cb,{ok:false,error:'Join first.'});
      if(!['move','incoming'].includes(data?.type))return ok(cb,{ok:false,error:'Invalid layer.'});
      const type=data.type;
      liveTracks.delete(socket.id+':'+type);ns.emit('border:live:remove',{owner:socket.id,type});
      ok(cb,{ok:true});
    });
    socket.on('border:mark',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join the room first.'});
      if(!throttle(socket,'mark',800))return ok(cb,{ok:false,error:'Wait before another map mark.'});
      if(marks.length>=100)return ok(cb,{ok:false,error:'Map is full; remove an old mark.'});
      const type=safe(data?.type,16);
      if(!TYPES.has(type))return ok(cb,{ok:false,error:'Invalid marker type.'});
      if(!inRange(data?.x)||!inRange(data?.y))return ok(cb,{ok:false,error:'Invalid map position.'});
      const item={id:id(),number:incidentNumber(),kind:'point',type,priority:type==='INCIDENT'?'major':data?.priority==='small'?'small':'major',x:data.x,y:data.y,label:safe(data?.label,70)||type,note:safe(data?.note,240),owner:socket.id,name:u.name,time:Date.now()};
      marks.push(item);ns.emit('border:mark',item);
      const h={id:id(),time:item.time,action:'PLACED',label:item.label,name:u.name,type};push(history,h,60);ns.emit('border:history',h);
      ok(cb,{ok:true,id:item.id});
    });
    socket.on('border:dispatch',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join Border Control first.'});
      if(!throttle(socket,'dispatch',2500))return ok(cb,{ok:false,error:'Please wait before another dispatch.'});
      if(!inRange(data?.x)||!inRange(data?.y))return ok(cb,{ok:false,error:'Invalid fictional map position.'});
      if(marks.length>=100)return ok(cb,{ok:false,error:'Remove an old mark first.'});
      const label=safe(data.label,70)||'UNIT ASSISTANCE REQUESTED';
      const item={id:id(),number:incidentNumber(),kind:'point',type:'DISPATCH',priority:'major',x:data.x,y:data.y,label,note:safe(data.note,240),owner:socket.id,name:u.name,time:Date.now()};
      marks.push(item);ns.emit('border:mark',item);
      ns.emit('border:dispatch:alert',{id:item.id,markId:item.id,name:u.name,label,time:item.time});
      const h={id:id(),time:item.time,action:'DISPATCH',label:item.label,name:u.name,type:'DISPATCH'};
      push(history,h,60);ns.emit('border:history',h);
      ok(cb,{ok:true,id:item.id});
    });
    socket.on('border:zone',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join the room first.'});
      if(!throttle(socket,'mark',800))return ok(cb,{ok:false,error:'Wait before another map mark.'});
      if(marks.length>=100)return ok(cb,{ok:false,error:'Map is full; remove an old mark.'});
      if(![data?.x1,data?.x2,data?.y1,data?.y2].every(inRange))return ok(cb,{ok:false,error:'Invalid area coordinates.'});
      const x1=Math.min(data.x1,data.x2),y1=Math.min(data.y1,data.y2),x2=Math.max(data.x1,data.x2),y2=Math.max(data.y1,data.y2);
      if(x2-x1<1.2||y2-y1<1.2)return ok(cb,{ok:false,error:'Draw a larger blocked area.'});
      const item={id:id(),number:incidentNumber(),kind:'zone',type:'BLOCK AREA',x1,y1,x2,y2,label:safe(data?.label,70)||'Blocked Area',note:safe(data?.note,240),owner:socket.id,name:u.name,time:Date.now()};
      marks.push(item);ns.emit('border:mark',item);
      const h={id:id(),time:item.time,action:'DRAWN',label:item.label,name:u.name,type:'BLOCK AREA'};push(history,h,60);ns.emit('border:history',h);
      ok(cb,{ok:true,id:item.id});
    });
    // Completion needs approval from a second, different connected player.
    socket.on('border:mission:request',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join Border Control first.'});
      const item=marks.find(m=>m.id===data?.id);
      if(!item)return ok(cb,{ok:false,error:'Map item is no longer active.'});
      if(item.owner!==socket.id)return ok(cb,{ok:false,error:'The creator must request confirmation.'});
      if(item.missionRequestedBy)return ok(cb,{ok:false,error:'Already awaiting another player.'});
      item.missionRequestedBy=socket.id;item.missionRequestedName=u.name;item.missionRequestedAt=Date.now();
      ns.emit('border:mission:updated',{id:item.id,missionRequestedBy:socket.id,missionRequestedName:u.name,missionRequestedAt:item.missionRequestedAt});
      ok(cb,{ok:true});
    });
    socket.on('border:mission:confirm',(data,cb)=>{
      const u=users.get(socket.id);if(!u)return ok(cb,{ok:false,error:'Join Border Control first.'});
      const index=marks.findIndex(m=>m.id===data?.id);
      if(index<0)return ok(cb,{ok:false,error:'Mission not found.'});
      const item=marks[index];
      if(!item.missionRequestedBy)return ok(cb,{ok:false,error:'Mission completion was not requested.'});
      if(item.missionRequestedBy===socket.id || item.owner===socket.id)return ok(cb,{ok:false,error:'A different player must confirm this mission.'});
      marks.splice(index,1);ns.emit('border:remove',{id:item.id});
      const finished={number:item.number||'BC-LEGACY',id:item.id,label:item.label,type:item.type,name:item.name,requestedBy:item.missionRequestedName,confirmedBy:u.name,time:Date.now()};
      push(completed,finished,80);ns.emit('border:mission:completed',finished);
      const h={id:id(),time:finished.time,action:'MISSION CONFIRMED',label:`${finished.number} / ${item.label}`,name:u.name,type:item.type};
      push(history,h,60);ns.emit('border:history',h);
      ok(cb,{ok:true,number:finished.number});
    });
    socket.on('border:remove',(data,cb)=>{
      if(!users.has(socket.id))return ok(cb,{ok:false,error:'Join the room first.'});
      const i=marks.findIndex(m=>m.id===data?.id);if(i<0)return ok(cb,{ok:false,error:'Not found.'});
      if(marks[i].owner!==socket.id)return ok(cb,{ok:false,error:'Only the creator can remove a marker.'});
      const [item]=marks.splice(i,1);ns.emit('border:remove',{id:item.id});
      const h={id:id(),time:Date.now(),action:'REMOVED',label:item.label,name:users.get(socket.id).name,type:item.type};push(history,h,60);ns.emit('border:history',h);
      ok(cb,{ok:true});
    });
    socket.on('disconnect',()=>{
      if(!users.has(socket.id))return;
      for(const call of [...privateCalls.values()])if(call.from===socket.id||call.to===socket.id)terminatePrivateCall(call,'Creator disconnected.');
      users.delete(socket.id);if(activeRadio?.id===socket.id)stopRadio();
      for(const type of ['move','incoming'])if(liveTracks.delete(socket.id+':'+type))ns.emit('border:live:remove',{owner:socket.id,type});
      change();
      for(let i=marks.length-1;i>=0;i--)if(marks[i].owner===socket.id){ns.emit('border:remove',{id:marks[i].id});marks.splice(i,1)}
      for(const k of sent.keys())if(k.startsWith(socket.id+':'))sent.delete(k);
    });
  });
  return {max:MAX,roster};
};
