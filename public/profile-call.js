'use strict';
/* One-to-one roleplay voice/video requests. Camera access is never automatic. */
(() => {
 const $=id=>document.getElementById(id);
 const screen=document.createElement('div');screen.className='creator-private-overlay';screen.id='creatorPrivateScreen';screen.hidden=true;
 screen.innerHTML=`<section class="creator-private-panel" role="dialog" aria-modal="true" aria-label="Private creator communication">
  <h3 id="creatorPrivateTitle">PRIVATE / VOICE REQUEST</h3>
  <p id="creatorPrivateStatus">Waiting for other player.</p>
  <div id="creatorPrivateVideos" class="creator-private-vid" hidden><video id="creatorPrivateRemote" playsinline autoplay></video><video id="creatorPrivateLocal" playsinline autoplay muted></video></div>
  <div class="creator-private-controls"><button id="creatorPrivateAccept" type="button" hidden>ACCEPT / ENABLE MIC</button><button id="creatorPrivateDecline" type="button" class="danger" hidden>DECLINE</button><button id="creatorPrivateEnable" type="button" hidden>ENABLE SOUND</button><button id="creatorPrivateMute" type="button" hidden>MUTE MIC</button><button id="creatorPrivateEnd" type="button" class="danger">END / CLOSE</button></div>
  <p>Voice and video are peer-to-peer where supported. Microphone/camera permissions are requested only after you accept or initiate a call.</p>
 </section>`;
 document.body.append(screen);
 let call=null,pc=null,stream=null,pendingIce=[],pendingSignals=[],busy=false;
 const rtc={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
 const send=(event,data)=>new Promise((resolve,reject)=>socket.timeout(8500).emit(event,data,(error,ack)=>error||!ack?.ok?reject(Error(ack?.error||'Connection problem')):resolve(ack)));
 function present(text){$('creatorPrivateStatus').textContent=text;screen.hidden=false}
 function controls({incoming=false,active=false}={}){
   $('creatorPrivateAccept').hidden=!incoming;$('creatorPrivateDecline').hidden=!incoming;
   $('creatorPrivateEnable').hidden=!active;$('creatorPrivateMute').hidden=!active;
   $('creatorPrivateVideos').hidden=!active||call?.kind!=='video';
 }
 function cleanup(){
   busy=false;pendingIce=[];pendingSignals=[];
   if(pc){pc.ontrack=pc.onicecandidate=null;try{pc.close()}catch{}}pc=null;
   if(stream){stream.getTracks().forEach(t=>t.stop())}stream=null;
   for(const id of ['creatorPrivateLocal','creatorPrivateRemote'])$(id).srcObject=null;
   call=null;screen.hidden=true;controls();
 }
 async function hangup(){const id=call?.id;cleanup();if(id)await send('border:private:end',{callId:id}).catch(()=>{});}
 async function media(kind){
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone/camera requires HTTPS and browser permission.');
   return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:kind==='video'?{facingMode:'user'}:false});
 }
 async function setup(){
   if(!call)return;
   const id=call.id;
   stream=await media(call.kind);
   if(!call||call.id!==id){stream.getTracks().forEach(t=>t.stop());return;}
   pc=new RTCPeerConnection(rtc);
   stream.getTracks().forEach(t=>pc.addTrack(t,stream));
   $('creatorPrivateLocal').srcObject=stream;
   if(call.kind==='video')$('creatorPrivateLocal').play().catch(()=>{});
   pc.ontrack=ev=>{const remote=ev.streams[0];$('creatorPrivateRemote').srcObject=remote;
      $('creatorPrivateRemote').play().catch(()=>present('Audio playback blocked; tap ENABLE SOUND.'));
      $('creatorPrivateStatus').textContent='CONNECTED / '+(call.kind==='video'?'LIVE CAMERA SHARED':'VOICE ONLY');};
   pc.onicecandidate=ev=>{if(ev.candidate&&call?.id===id)send('border:private:signal',{callId:id,signal:{candidate:ev.candidate.toJSON()}}).catch(()=>{})};
   pc.onconnectionstatechange=()=>{if(['failed','disconnected'].includes(pc?.connectionState))$('creatorPrivateStatus').textContent='CONNECTION INTERRUPTED / TRY AGAIN'};
   controls({active:true});
   for(const sig of pendingSignals.splice(0))await signal(sig);
   if(call.initiator){const offer=await pc.createOffer();await pc.setLocalDescription(offer);await send('border:private:signal',{callId:id,signal:{description:pc.localDescription}});}
 }
 async function signal(s){
   if(!pc){pendingSignals.push(s);return;}
   if(s.description){await pc.setRemoteDescription(s.description);
      for(const c of pendingIce.splice(0))await pc.addIceCandidate(c);
      if(s.description.type==='offer'){const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await send('border:private:signal',{callId:call.id,signal:{description:pc.localDescription}})}
   }
   if(s.candidate){if(pc.remoteDescription)await pc.addIceCandidate(s.candidate);else pendingIce.push(s.candidate)}
 }
 async function invite(id,kind,source){
   if(!state.joined)return toast('Join the Border Control room first.');
   if(!id||id===state.id)return toast('Choose another online unit.');
   if(call||busy)return toast('Finish the current private call first.');
   busy=true;
   $('creatorPrivateTitle').textContent=kind==='video'?'REQUEST CREATOR CAMERA':'DIRECT MICROPHONE / CREATOR';
   present('RINGING / AWAITING CREATOR ACCEPTANCE');
   try{const r=await send('border:private:invite',{to:id,kind,context:source?.label||'MARK'});
      call={id:r.callId,to:id,kind,initiator:true};busy=false;controls();}
   catch(err){cleanup();toast(err.message)}
 }
 socket.on('border:private:incoming',d=>{
   if(call||busy){send('border:private:answer',{callId:d.callId,accept:false}).catch(()=>{});return;}
   call={id:d.callId,to:d.from,kind:d.kind,initiator:false};
   $('creatorPrivateTitle').textContent=(d.kind==='video'?'CAMERA + MIC':'VOICE ONLY')+' / '+(d.fromName||'CREATOR');
   present(`${d.fromName||'A player'} requests a ${d.kind} connection about ${d.context||'a map mark'}. Camera/mic stay off until you accept.`);
   controls({incoming:true});
 });
 socket.on('border:private:accepted',async d=>{
   if(!call||call.id!==d.callId)return;
   present('CONNECTING / REQUESTING YOUR MEDIA PERMISSION');
   try{await setup()}catch(err){present('CALL FAILED: '+err.message);await hangup();toast('Call setup failed: '+err.message)}
 });
 socket.on('border:private:signal',d=>{if(!call||call.id!==d.callId)return;signal(d.signal).catch(err=>{present('SIGNAL ERROR: '+err.message)})});
 socket.on('border:private:ended',d=>{if(call?.id===d.callId){cleanup();toast(d.reason||'Private call ended.')}});
 socket.on('disconnect',()=>cleanup());
 $('creatorPrivateAccept').onclick=async()=>{if(!call)return;
   $('creatorPrivateAccept').disabled=true;
   try{await send('border:private:answer',{callId:call.id,accept:true});present('ACCEPTED / CONNECTING');controls()}
   catch(err){toast(err.message);cleanup()}
   finally{$('creatorPrivateAccept').disabled=false;}
 };
 $('creatorPrivateDecline').onclick=async()=>{const id=call?.id;cleanup();if(id)await send('border:private:answer',{callId:id,accept:false}).catch(()=>{})};
 $('creatorPrivateEnd').onclick=hangup;
 $('creatorPrivateEnable').onclick=()=>{$('creatorPrivateRemote').play().catch(()=>toast('Tap speaker permission in your browser.'))};
 let muted=false;
 $('creatorPrivateMute').onclick=()=>{if(!stream)return;muted=!muted;stream.getAudioTracks().forEach(t=>t.enabled=!muted);$('creatorPrivateMute').textContent=muted?'UNMUTE MIC':'MUTE MIC'};
 window.BorderPrivateCall={invite};
})();
