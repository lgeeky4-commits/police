'use strict';
/* Media and radio are opt-in. Only the user can enable camera/mic. */
(() => {
  const byId=id=>document.getElementById(id);
  const send=(name,data)=>new Promise((resolve,reject)=>socket.timeout(9500).emit(name,data,(err,ack)=>err||!ack?.ok?reject(Error(ack?.error||'Connection unavailable')):resolve(ack)));
  let cameraStream=null,recorder=null,recordClock=null,recordStop=null,objectUrl=null;
  let cameraVision='color',processedStream=null,filterFrameHandle=null;
  try{const saved=localStorage.getItem('bc-camera-vision');if(['color','night','heat'].includes(saved))cameraVision=saved}catch{}
  let captureNonce=0,chosenKind='photo',facing='environment',captured=null;
  const maxPhoto=1100000,maxVideo=2200000;
  const startedAt=()=>new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  const displayCapture=(text)=>{byId('captureStatus').textContent=text};
  function stopProcessedStream(){
    if(filterFrameHandle!==null){cancelAnimationFrame(filterFrameHandle);filterFrameHandle=null;}
    if(processedStream){processedStream.getTracks().forEach(track=>track.stop());processedStream=null;}
  }
  function selectVision(mode){
    if(!['color','night','heat'].includes(mode))return;
    if(recorder?.state==='recording')return toast('Stop recording before changing the camera filter.');
    cameraVision=mode;byId('cameraStage')?.setAttribute('data-vision',mode);
    document.querySelectorAll('[data-cam-vision]').forEach(b=>b.classList.toggle('active',b.dataset.camVision===mode));
    try{localStorage.setItem('bc-camera-vision',mode)}catch{}
    displayCapture('CAMERA FILTER / '+(mode==='night'?'NIGHT VISION (SIMULATED)':mode==='heat'?'HEAT EFFECT (SIMULATED)':'COLOR'));
  }
  function paintFrame(video,canvas){
    if(!video.videoWidth||!video.videoHeight)return false;
    const ctx=canvas.getContext('2d',{alpha:false,willReadFrequently:cameraVision==='heat'});
    ctx.save();ctx.filter=cameraVision==='night'?'grayscale(1) contrast(1.75) brightness(1.12)':cameraVision==='heat'?'grayscale(1) contrast(1.4)':'none';
    ctx.drawImage(video,0,0,canvas.width,canvas.height);ctx.restore();
    if(cameraVision==='night'){
      ctx.save();ctx.globalCompositeOperation='multiply';ctx.fillStyle='#33ff6c';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(0,30,8,.18)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.restore();
    }else if(cameraVision==='heat'){
      const img=ctx.getImageData(0,0,canvas.width,canvas.height),data=img.data;
      // Invented heat color ramp based on visible brightness (NOT an infrared or thermal measurement).
      for(let i=0;i<data.length;i+=4){const v=(data[i]*.299+data[i+1]*.587+data[i+2]*.114)/255;
        const stops=[[16,22,72],[78,18,132],[206,27,81],[255,137,20],[255,245,141],[255,255,255]];
        const scaled=v*(stops.length-1),lo=Math.min(stops.length-2,Math.floor(scaled)),t=scaled-lo;
        for(let j=0;j<3;j++)data[i+j]=stops[lo][j]*(1-t)+stops[lo+1][j]*t;
      }
      ctx.putImageData(img,0,0);
    }
    return true;
  }
  function clearClips(){
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    byId('photoPreview').hidden=true;
    byId('photoPreview').removeAttribute('src');
    byId('clipPreview').pause();byId('clipPreview').removeAttribute('src');byId('clipPreview').load();byId('clipPreview').hidden=true;
    captured=null;
    byId('sendMediaChat').disabled=true;byId('sendMediaMap').disabled=true;byId('retakeMedia').disabled=true;
  }
  function stopCamera(){
    if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
    byId('cameraPreview').srcObject=null;
  }
  function cancelRecorder(){
    stopProcessedStream();
    clearTimeout(recordStop);clearInterval(recordClock);recordStop=recordClock=null;
    if(recorder&&recorder.state!=='inactive')try{recorder.stop()}catch{}
    recorder=null;
    byId('stopRecording').hidden=true;
    byId('startRecording').hidden=false;
  }
  function closeCamera(){
    captureNonce++;
    cancelRecorder();stopCamera();clearClips();
    byId('captureOverlay').hidden=true;
  }
  async function openStream(){
    const nonce=++captureNonce;
    stopCamera();
    displayCapture('CAMERA PERMISSION REQUESTED');
    const video={width:{ideal:640},height:{ideal:480},frameRate:{ideal:15},facingMode:{ideal:facing}};
    let stream;
    try{stream=await navigator.mediaDevices.getUserMedia({video,audio:chosenKind==='video'?{echoCancellation:true,noiseSuppression:true}:false})}
    catch(e){
      if(chosenKind==='video'){
        // Some phones permit the camera but not the microphone.
        try{stream=await navigator.mediaDevices.getUserMedia({video,audio:false});toast('Microphone unavailable: recording video without sound.');}
        catch(e2){throw e2}
      }else throw e;
    }
    if(nonce!==captureNonce||byId('captureOverlay').hidden){stream.getTracks().forEach(t=>t.stop());return;}
    cameraStream=stream;
    const preview=byId('cameraPreview');preview.hidden=false;preview.srcObject=stream;
    await preview.play().catch(()=>{});
    displayCapture(`${chosenKind.toUpperCase()} / ${facing==='environment'?'REAR':'FRONT'} CAMERA READY / ${cameraVision.toUpperCase()} FILTER`);
  }
  async function openCamera(kind){
    if(!state.joined){toast('Join the field room first.');return;}
    if(!navigator.mediaDevices?.getUserMedia){toast('Browser camera requires HTTPS, a compatible browser, and permission.');return;}
    chosenKind=kind;facing='environment';selectVision(cameraVision);
    byId('captureTitle').textContent=kind==='photo'?'BROWSER PHOTO':'BROWSER VIDEO';
    byId('captureOverlay').hidden=false;clearClips();
    byId('cameraPreview').hidden=false;
    byId('capturePhotoBtn').hidden=kind!=='photo';
    byId('startRecording').hidden=kind!=='video';
    byId('stopRecording').hidden=true;
    displayCapture('OPENING CAMERA');
    try{await openStream()}catch(e){displayCapture('CAMERA UNAVAILABLE');toast(`Cannot open camera: ${e.message}`)}
  }
  function onCaptured(data){
    captured=data;stopCamera();byId('cameraPreview').hidden=true;
    byId('sendMediaChat').disabled=false;byId('sendMediaMap').disabled=false;byId('retakeMedia').disabled=false;
    displayCapture(`${data.kind.toUpperCase()} READY / ${(data.data.length/1024).toFixed(0)} KB ENCODED`);
  }
  function takePhoto(){
    if(!cameraStream||chosenKind!=='photo')return toast('Open the photo camera first.');
    const v=byId('cameraPreview');
    if(!v.videoWidth)return toast('Camera is still starting.');
    const canvas=document.createElement('canvas');
    const ratio=Math.min(1,960/v.videoWidth);canvas.width=Math.round(v.videoWidth*ratio);canvas.height=Math.round(v.videoHeight*ratio);
    if(!paintFrame(v,canvas))return toast('Camera image not ready yet.');
    const data=canvas.toDataURL('image/jpeg',.7);
    if(data.length>maxPhoto*4/3+100)return toast('Photo too large. Move closer and try again.');
    byId('photoPreview').src=data;byId('photoPreview').hidden=false;
    onCaptured({kind:'photo',mime:'image/jpeg',data});
  }
  function supportedMime(){
    if(!window.MediaRecorder)return '';
    const variants=['video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'];
    return variants.find(v=>MediaRecorder.isTypeSupported(v))||'';
  }
  function readBlob(b){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Could not read recording.'));r.onload=()=>resolve(r.result);r.readAsDataURL(b)})}
  function startRecording(){
    if(!cameraStream)return toast('Open the video camera first.');
    if(recorder?.state==='recording')return;
    const mime=supportedMime();
    if(!mime)return toast('This browser does not support in-browser video recording.');
    let rec;
    try{
      const video=byId('cameraPreview');
      const canvas=document.createElement('canvas');
      // Reduced resolution keeps live heat processing responsive on phones.
      const factor=Math.min(1,540/(video.videoWidth||640));
      canvas.width=Math.max(160,Math.round((video.videoWidth||640)*factor));
      canvas.height=Math.max(120,Math.round((video.videoHeight||480)*factor));
      if(typeof canvas.captureStream!=='function')throw Error('Filtered video recording is unavailable in this browser.');
      function renderLoop(){if(!cameraStream||byId('captureOverlay').hidden)return;
        paintFrame(video,canvas);filterFrameHandle=requestAnimationFrame(renderLoop);}
      renderLoop();
      processedStream=canvas.captureStream(15);
      // Microphone tracks remain opt-in. The canvas stream contains only filtered video.
      for(const track of cameraStream.getAudioTracks())processedStream.addTrack(track.clone());
      rec=new MediaRecorder(processedStream,{mimeType:mime,videoBitsPerSecond:360000,audioBitsPerSecond:48000});
    }catch(e){stopProcessedStream();toast(`Recording unavailable: ${e.message}`);return}
    const nonce=captureNonce;
    const chunks=[];recorder=rec;const begin=Date.now();
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    rec.onerror=()=>{toast('Video recorder error.');stopRecording()};
    rec.onstop=async()=>{
      stopProcessedStream();
      clearInterval(recordClock);clearTimeout(recordStop);recordClock=recordStop=null;
      byId('stopRecording').hidden=true;byId('startRecording').hidden=false;
      if(nonce!==captureNonce)return;
      const mime2=(rec.mimeType||mime).split(';')[0];
      const clip=new Blob(chunks,{type:mime2});
      if(clip.size>maxVideo)return displayCapture('VIDEO TOO LARGE / RETAKE AT LOWER QUALITY');
      if(clip.size<64)return displayCapture('EMPTY VIDEO / RETAKE');
      try{
        const data=await readBlob(clip);
        if(nonce!==captureNonce)return;
        objectUrl=URL.createObjectURL(clip);
        byId('clipPreview').src=objectUrl;byId('clipPreview').hidden=false;
        onCaptured({kind:'video',mime:mime2,data});
      }catch(e){toast(e.message)}
    };
    try{rec.start(250)}catch(e){stopProcessedStream();return toast(`Video start failed: ${e.message}`)}
    byId('startRecording').hidden=true;byId('stopRecording').hidden=false;
    displayCapture('REC ● 0.0 / 8.0 SECONDS');
    recordClock=setInterval(()=>{displayCapture(`REC ● ${Math.min(8,(Date.now()-begin)/1000).toFixed(1)} / 8.0 SECONDS`)},250);
    recordStop=setTimeout(stopRecording,8000);
  }
  function stopRecording(){
    if(recorder?.state==='recording'){
      clearTimeout(recordStop);recordStop=null;
      try{recorder.stop()}catch(e){toast(e.message)}
    }
  }
  async function retake(){
    if(!byId('captureOverlay').hidden){clearClips();
      byId('cameraPreview').hidden=false;
      try{await openStream()}catch(e){toast(e.message)}
    }
  }
  async function sendChat(){
    if(!captured)return;
    const b=byId('sendMediaChat');b.disabled=true;displayCapture('SHARING TO ROOM…');
    try{await send('border:media',captured);toast('Photo/video sent to field chat.');closeCamera();}
    catch(e){toast(e.message);b.disabled=false;displayCapture('SEND FAILED / RETRY')}
  }
  function placeOnMap(){
    if(!captured)return;
    // Retain the selected media until the user places their map marker.
    pendingMedia=captured;
    captureNonce++;cancelRecorder();stopCamera();byId('captureOverlay').hidden=true;
    setMode('media');
    byId('mapViewport').scrollIntoView({behavior:'smooth',block:'center'});
    toast('Tap a fictional map location for the photo/video report.');
  }
  let pendingMedia=null;
  const pending=()=>pendingMedia;
  const clearPending=()=>{pendingMedia=null;clearClips()};
  
  // Browser-based, permission-controlled live push-to-talk audio via WebRTC.
  let audioContext=null,hasEnabledAudio=false;
  let localTalk=null,pressed=false,starting=false,transmitting=false,radioActive=null,radioWatchdog=null;
  const outbound=new Map(),inbound=new Map(),remoteAudio=new Map(),iceQueue=new Map();
  let micTestStream=null,micTestRecorder=null,micTestTimer=null,micTestUrl=null,micTestPlayer=null;
  let monitorEnabled=false,monitorSource=null,monitorGain=null;
  const micStatus=text=>{byId('micTestStatus').textContent=text};
  const rtcCfg={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
  const tone=text=>{byId('radioStatus').textContent=text};
  async function enableAudio(){
    try{
      if(!window.AudioContext&&!window.webkitAudioContext)throw Error('Audio playback not supported');
      if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();
      await audioContext.resume();hasEnabledAudio=true;
      for(const audio of remoteAudio.values()){
        audio.muted=false;audio.volume=1;
        try{await audio.play()}catch(e){micStatus('Speaker is enabled, but playback is blocked. Check phone volume and tap ENABLE SPEAKER again.');}
      }
      byId('enableAudio').textContent='SPEAKER ENABLED';
      toast(monitorEnabled?'Speaker enabled. Hold TALK with headphones to monitor your voice.':'Speaker enabled. Another player must transmit for you to hear live audio.');
    }catch(e){toast('Tap ENABLE SPEAKER again: '+e.message)}
  }
  function stopMicTest(){
    clearTimeout(micTestTimer);micTestTimer=null;
    if(micTestRecorder?.state==='recording')try{micTestRecorder.stop()}catch{}
    micTestStream?.getTracks().forEach(t=>t.stop());micTestStream=null;
  }
  async function recordMicTest(){
    if(micTestRecorder?.state==='recording')return;
    if(transmitting||starting)return micStatus('Release HOLD TO TALK before testing the microphone.');
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return micStatus('Microphone test needs HTTPS and a browser with recording support.');
    byId('micTestPlay').disabled=true;
    byId('micTestRecord').disabled=true;
    if(micTestUrl){URL.revokeObjectURL(micTestUrl);micTestUrl=null}
    micStatus('REQUESTING MICROPHONE...');
    try{
      micTestStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      const candidates=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
      const mime=candidates.find(v=>MediaRecorder.isTypeSupported(v));
      micTestRecorder=new MediaRecorder(micTestStream,mime?{mimeType:mime}:undefined);
      const chunks=[];
      micTestRecorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      micTestRecorder.onerror=()=>micStatus('Microphone recording failed. Check permissions.');
      micTestRecorder.onstop=()=>{
        micTestStream?.getTracks().forEach(t=>t.stop());micTestStream=null;
        clearTimeout(micTestTimer);micTestTimer=null;
        byId('micTestRecord').disabled=false;
        const blob=new Blob(chunks,{type:micTestRecorder.mimeType||mime||'audio/webm'});
        if(blob.size<32)return micStatus('No audio captured. Check microphone permission and try again.');
        micTestUrl=URL.createObjectURL(blob);
        byId('micTestPlay').disabled=false;
        micStatus('TEST READY — tap PLAY MY TEST to hear your recording.');
      };
      micTestRecorder.start();
      micStatus('RECORDING MICROPHONE / 3 SECONDS');
      micTestTimer=setTimeout(()=>{if(micTestRecorder?.state==='recording')micTestRecorder.stop()},3000);
    }catch(e){
      micTestStream?.getTracks().forEach(t=>t.stop());micTestStream=null;
      byId('micTestRecord').disabled=false;
      micStatus('MICROPHONE NOT AVAILABLE: '+e.message);
    }
  }
  async function playMicTest(){
    if(!micTestUrl)return micStatus('Record a microphone test first.');
    if(micTestPlayer){micTestPlayer.pause();micTestPlayer.src='';}
    micTestPlayer=new Audio(micTestUrl);
    micTestPlayer.volume=1;
    micTestPlayer.onended=()=>micStatus('Mic test finished. If you heard yourself, the microphone works.');
    try{await micTestPlayer.play();micStatus('PLAYING YOUR MICROPHONE TEST...');}
    catch(e){micStatus('Playback blocked: '+e.message+'. Raise media volume and tap PLAY again.');}
  }
  function closePeer(pc){try{pc?.close()}catch{}}
  function closeRadioPeers(){
    for(const p of outbound.values())closePeer(p);
    for(const p of inbound.values())closePeer(p);
    outbound.clear();inbound.clear();iceQueue.clear();
    for(const audio of remoteAudio.values()){
      try{audio.pause();audio.srcObject=null;audio.remove()}catch{}
    }
    remoteAudio.clear();
  }
  function stopMonitor(){
    try{monitorSource?.disconnect()}catch{}
    try{monitorGain?.disconnect()}catch{}
    monitorSource=null;monitorGain=null;
  }
  function startMonitor(){
    stopMonitor();
    if(!monitorEnabled||!localTalk||!audioContext)return;
    try{
      monitorSource=audioContext.createMediaStreamSource(localTalk);
      monitorGain=audioContext.createGain();
      monitorGain.gain.value=.25;
      monitorSource.connect(monitorGain);monitorGain.connect(audioContext.destination);
      audioContext.resume().catch(()=>{});
    }catch(e){micStatus('Microphone monitor unavailable: '+e.message)}
  }
  async function toggleMonitor(){
    monitorEnabled=!monitorEnabled;
    const button=byId('monitorMic');
    button.textContent=monitorEnabled?'HEAR MYSELF / ON':'HEAR MYSELF / OFF';
    button.setAttribute('aria-pressed',String(monitorEnabled));
    if(monitorEnabled){
      micStatus('LIVE MICROPHONE MONITOR ON. USE HEADPHONES to avoid loud feedback. Hold TALK to hear your own voice.');
      await enableAudio();
      if(transmitting)startMonitor();
    }else{stopMonitor();micStatus('Microphone monitor off. Use TEST MY MIC to check your recorded voice.');}
  }
  function stopLocalAudio(){
    stopMonitor();
    if(localTalk){localTalk.getTracks().forEach(t=>t.stop());localTalk=null;}
  }
  const signal=(to,type,signal)=>socket.emit('border:radio:signal',{to,type,signal},()=>{});
  function radioUI(){
    byId('radioTalk').classList.toggle('transmitting',transmitting);
    byId('radioTalk').textContent=transmitting?'TRANSMITTING / RELEASE TO STOP':'HOLD TO TALK';
    if(transmitting)tone('ON AIR / YOU');
    else if(radioActive?.active)tone(`ON AIR / ${radioActive.name}`);
    else tone('IDLE');
  }
  async function stopTalk(){
    pressed=false;
    clearTimeout(radioWatchdog);radioWatchdog=null;
    if(transmitting){transmitting=false;socket.emit('border:radio:stop',{},()=>{})}
    starting=false;stopLocalAudio();
    for(const pc of outbound.values())closePeer(pc);outbound.clear();
    radioUI();
  }
  async function startTalk(){
    if(!state.joined)return toast('Join the field room first.');
    if(!socket.connected)return toast('Not connected to field room.');
    if(transmitting||starting)return;
    if(radioActive?.active&&radioActive.id!==state.id)return toast(`Radio busy: ${radioActive.name}`);
    if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)return toast('Radio needs HTTPS and WebRTC support.');
    pressed=true;starting=true;tone('REQUESTING MICROPHONE');
    try{
      localTalk=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(!pressed){stopLocalAudio();starting=false;radioUI();return}
      const reply=await send('border:radio:start',{});
      if(!pressed){socket.emit('border:radio:stop',{},()=>{});stopLocalAudio();starting=false;radioUI();return}
      transmitting=true;starting=false;radioActive={active:true,id:state.id,name:state.name};radioUI();
      startMonitor();
      radioWatchdog=setTimeout(()=>stopTalk(),29000);
      const others=(reply.roster||[]).filter(u=>u.id!==state.id);
      await Promise.all(others.map(async u=>{
        if(!transmitting)return;
        const pc=new RTCPeerConnection(rtcCfg);outbound.set(u.id,pc);
        for(const track of localTalk.getTracks())pc.addTrack(track,localTalk);
        pc.onicecandidate=e=>{if(e.candidate&&transmitting)signal(u.id,'ice',{candidate:e.candidate.toJSON()})};
        const offer=await pc.createOffer();await pc.setLocalDescription(offer);
        if(transmitting)signal(u.id,'offer',{sdp:pc.localDescription});
      }));
    }catch(e){toast(`Radio unavailable: ${e.message}`);await stopTalk()}
  }
  async function applyCandidates(peer,from){
    const list=iceQueue.get(from)||[];iceQueue.delete(from);
    for(const c of list)try{await peer.addIceCandidate(c)}catch{}
  }
  async function onSignal(d){
    if(!state.joined||!d||d.from===state.id)return;
    if(d.type==='ice'){
      if(!d.signal?.candidate)return;
      const pc=inbound.get(d.from)||outbound.get(d.from);
      if(pc?.remoteDescription){try{await pc.addIceCandidate(d.signal.candidate)}catch{}}
      else{const list=iceQueue.get(d.from)||[];list.push(d.signal.candidate);if(list.length>40)list.shift();iceQueue.set(d.from,list)}
      return;
    }
    if(d.type==='offer'){
      // A server-authorized OFFER may arrive before the radio-status broadcast.
      // Accept it: the server only relays offers from the active transmitter.
      if(!window.RTCPeerConnection)return;
      if(!hasEnabledAudio){byId('enableAudio').textContent='TAP TO HEAR RADIO';}
      const old=inbound.get(d.from);if(old)closePeer(old);
      const pc=new RTCPeerConnection(rtcCfg);inbound.set(d.from,pc);
      pc.addTransceiver('audio',{direction:'recvonly'});
      pc.onicecandidate=e=>{if(e.candidate)signal(d.from,'ice',{candidate:e.candidate.toJSON()})};
      pc.ontrack=async e=>{
        const media=e.streams[0]||new MediaStream([e.track]);
        let audio=remoteAudio.get(d.from);
        if(!audio){
          audio=document.createElement('audio');audio.className='remote-radio-audio';
          audio.autoplay=true;audio.playsInline=true;audio.preload='auto';
          document.body.append(audio);remoteAudio.set(d.from,audio);
        }
        audio.srcObject=media;
        audio.muted=false;
        audio.volume=1;
        audio.onplaying=()=>tone('RECEIVING AUDIO / '+(radioActive?.name||'REMOTE PLAYER'));
        try{await audio.play();hasEnabledAudio=true;byId('enableAudio').textContent='SPEAKER ENABLED'}
        catch(e){byId('enableAudio').textContent='TAP TO HEAR RADIO';micStatus('Incoming radio audio is ready. Tap ENABLE SPEAKER to allow playback.');}
      };
      pc.onconnectionstatechange=()=>{
        if(pc.connectionState==='connected')tone('RADIO CONNECTED / '+(radioActive?.name||'REMOTE'));
        if(pc.connectionState==='failed'){
          tone('RADIO LINK FAILED');
          micStatus('Audio link failed. Try another network; some phones require a TURN relay.');
        }
      };
      try{await pc.setRemoteDescription(d.signal?.sdp);await applyCandidates(pc,d.from);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);signal(d.from,'answer',{sdp:pc.localDescription})}catch(e){toast('Radio link issue: '+e.message)}
    }
    if(d.type==='answer'){
      const pc=outbound.get(d.from);if(!pc||!transmitting)return;
      try{await pc.setRemoteDescription(d.signal?.sdp);await applyCandidates(pc,d.from)}catch{}
    }
  }
  function onRadioState(d){
    radioActive=d||{active:false};
    if(!radioActive.active){
      if(transmitting||starting)stopTalk();
      closeRadioPeers();
    }
    radioUI();
  }
  function bindPTT(){
    const button=byId('radioTalk');
    button.addEventListener('pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;e.preventDefault();try{button.setPointerCapture(e.pointerId)}catch{};startTalk()});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{if(pressed||transmitting)stopTalk()});
    button.addEventListener('contextmenu',e=>e.preventDefault());
    button.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();startTalk()}});
    button.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();stopTalk()}});
    byId('enableAudio').addEventListener('click',enableAudio);
    byId('monitorMic').addEventListener('click',toggleMonitor);
    byId('micTestRecord').addEventListener('click',recordMicTest);
    byId('micTestPlay').addEventListener('click',playMicTest);
    // Join and Send are user-initiated interactions suitable for audio-unlocking.
    byId('joinBtn').addEventListener('click',()=>{
      if(!audioContext&&(window.AudioContext||window.webkitAudioContext)){
        try{audioContext=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume().then(()=>{hasEnabledAudio=true;byId('enableAudio').textContent='SPEAKER ENABLED'}).catch(()=>{})}catch{}
      }
    });
    socket.on('border:radio:state',onRadioState);
    socket.on('border:radio:signal',d=>{onSignal(d).catch(()=>{})});
    socket.on('disconnect',()=>{stopTalk();closeRadioPeers();radioActive=null;radioUI()});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTalk()});
    window.addEventListener('pagehide',()=>{stopTalk();closeCamera();stopMicTest();if(micTestPlayer)micTestPlayer.pause();if(micTestUrl)URL.revokeObjectURL(micTestUrl)});
  }
  function init(){
    byId('takePhoto').addEventListener('click',()=>openCamera('photo'));
    byId('recordVideo').addEventListener('click',()=>openCamera('video'));
    byId('captureClose').addEventListener('click',closeCamera);
    byId('captureOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeCamera()});
    byId('flipCamera').addEventListener('click',async()=>{
      if(recorder?.state==='recording')return toast('Stop recording before switching cameras.');
      facing=facing==='environment'?'user':'environment';clearClips();try{await openStream()}catch(e){toast(e.message)}
    });
    byId('capturePhotoBtn').addEventListener('click',takePhoto);
    byId('startRecording').addEventListener('click',startRecording);
    byId('stopRecording').addEventListener('click',stopRecording);
    byId('sendMediaChat').addEventListener('click',sendChat);
    byId('sendMediaMap').addEventListener('click',placeOnMap);
    byId('retakeMedia').addEventListener('click',retake);
    document.querySelectorAll('[data-cam-vision]').forEach(b=>b.addEventListener('click',()=>selectVision(b.dataset.camVision)));
    selectVision(cameraVision);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!byId('captureOverlay').hidden)closeCamera()});
    bindPTT();
  }
  window.BCMedia={init,pending,clearPending,onRadioState};
  init();
})();
