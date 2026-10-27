'use strict';
/* Border Control v1.4: local visual presets, opt-in alerts, map effects, fullscreen. */
(() => {
 const by=id=>document.getElementById(id);
 const themes={
  'dark-bravo':{text:'#dde9e8',line:'#384d52',font:'mono',pattern:'scan',wall:5,boxes:{header:'#0b1216',left:'#111e24',map:'#0c1920',right:'#111c22',chat:'#0a1419',tool:'#28333a',popup:'#19252b'}},
  'cool-night':{text:'#d9f4ff',line:'#355f7b',font:'modern',pattern:'grid',wall:11,boxes:{header:'#061624',left:'#0b2438',map:'#071927',right:'#0d293c',chat:'#091a2b',tool:'#194459',popup:'#122e42'}},
  'sunny-day':{text:'#3a3328',line:'#ad916e',font:'modern',pattern:'none',wall:8,boxes:{header:'#f5e5c0',left:'#f3e1b7',map:'#e9d6a8',right:'#f8e9c9',chat:'#fff0ca',tool:'#dcc292',popup:'#f7e8c4'}},
  'cool-morning':{text:'#263f4b',line:'#86a5af',font:'condensed',pattern:'dots',wall:14,boxes:{header:'#dbe9ee',left:'#c9dde4',map:'#b8d2d8',right:'#dde9ee',chat:'#e9f2f2',tool:'#adc9d0',popup:'#d9e8ea'}},
  'midnight-orange':{text:'#f3e5d6',line:'#774932',font:'industrial',pattern:'diagonal',wall:22,boxes:{header:'#0b0d10',left:'#171417',map:'#110f15',right:'#211518',chat:'#130f12',tool:'#46251d',popup:'#271918'}}
 };
 const key='border-control-command-layout-v1';
 let current='dark-bravo',previousLayout=null,previousCustomTheme=false;
 try{previousLayout=localStorage.getItem(key);current=previousLayout||current;previousCustomTheme=!!JSON.parse(localStorage.getItem('border-rp-theme-v12')||'null')?.active}catch{}
 if(!themes[current])current='dark-bravo';
 function apply(name,updatePalette){
  if(!themes[name])return;
  current=name;document.body.dataset.commandLayout=name;
  document.querySelectorAll('[data-layout-preset]').forEach(b=>{b.classList.toggle('selected',b.dataset.layoutPreset===name);b.setAttribute('aria-pressed',String(b.dataset.layoutPreset===name))});
  if(updatePalette)window.BorderThemeStudio?.applyPreset?.(themes[name]);
  try{localStorage.setItem(key,name)}catch{}
  requestAnimationFrame(()=>{if(typeof applyZoom==='function')applyZoom()});
 }
 for(const id of ['openLayouts','openLayoutsMap'])by(id)?.addEventListener('click',()=>{by('layoutsOverlay').hidden=false;apply(current,false)});
 by('closeLayouts').addEventListener('click',()=>by('layoutsOverlay').hidden=true);
 by('layoutsOverlay').addEventListener('click',e=>{if(e.target===by('layoutsOverlay'))by('layoutsOverlay').hidden=true});
 document.querySelectorAll('[data-layout-preset]').forEach(b=>b.addEventListener('click',()=>{apply(b.dataset.layoutPreset,true);by('layoutsOverlay').hidden=true;toast('Layout set to '+b.querySelector('strong').textContent)}));
 apply(current,!previousLayout&&!previousCustomTheme);
 // Map heat/night are visual simulations, never real thermal information.
 let vision='color';try{vision=localStorage.getItem('border-map-vision')||vision}catch{}
 function setVision(mode){if(!['color','night','heat'].includes(mode))return;
  vision=mode;by('mapViewport').dataset.vision=mode;
  document.querySelectorAll('[data-map-vision]').forEach(b=>b.classList.toggle('active',b.dataset.mapVision===mode));
  try{localStorage.setItem('border-map-vision',mode)}catch{}
 }
 document.querySelectorAll('[data-map-vision]').forEach(b=>b.addEventListener('click',()=>setVision(b.dataset.mapVision)));
 setVision(vision);
 // Map fullscreen with a CSS fallback for phones where Element.requestFullscreen is unsupported.
 const center=document.querySelector('.center'),btn=by('mapFullscreen');
 let fallback=false;
 function updateFullscreen(){const on=!!document.fullscreenElement||fallback;btn.textContent=on?'EXIT FULLSCREEN':'FULLSCREEN';btn.setAttribute('aria-pressed',String(on));requestAnimationFrame(()=>typeof applyZoom==='function'&&applyZoom())}
 async function toggleFullscreen(){
  if(document.fullscreenElement){try{await document.exitFullscreen()}catch{}return}
  if(fallback){fallback=false;document.body.classList.remove('map-maximized');updateFullscreen();return}
  if(center?.requestFullscreen){try{await center.requestFullscreen();updateFullscreen();return}catch{}}
  fallback=true;document.body.classList.add('map-maximized');updateFullscreen();
 }
 btn.addEventListener('click',toggleFullscreen);
 document.addEventListener('fullscreenchange',updateFullscreen);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&fallback){fallback=false;document.body.classList.remove('map-maximized');updateFullscreen()}});
 // Room-wide, consent-based fictional dispatch signals.
 const alertBox=by('dispatchToast'),alertText=by('dispatchMessage');let clearFlash;
 let audioCtx=null;
 const unlock=()=>{if(audioCtx){audioCtx.resume().catch(()=>{});return}try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audioCtx=new Audio();audioCtx.resume().catch(()=>{})}}catch{}};
 document.addEventListener('pointerdown',unlock,{once:true});
 function playDispatchTone(){if(!audioCtx||audioCtx.state!=='running')return;
  const now=audioCtx.currentTime;
  for(let i=0;i<2;i++){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=i?580:435;
    const t=now+i*.24;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+.17);
    o.connect(g);g.connect(audioCtx.destination);o.start(t);o.stop(t+.19)}
 }
 socket.on('border:dispatch:alert',payload=>{
  if(!payload||typeof payload.label!=='string')return;
  alertText.textContent=`${payload.name||'Field unit'}: ${payload.label}\n${new Date(payload.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} / Fictional roleplay incident`;
  alertBox.hidden=false;
  const vp=by('mapViewport');vp.classList.remove('dispatch-flash');void vp.offsetWidth;vp.classList.add('dispatch-flash');
  clearTimeout(clearFlash);clearFlash=setTimeout(()=>vp.classList.remove('dispatch-flash'),3800);
  playDispatchTone();
 });
 by('dispatchDismiss').addEventListener('click',()=>alertBox.hidden=true);
})();
