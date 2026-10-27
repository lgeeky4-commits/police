"use strict";
/* Border Control v1.5 — actual sidebar workspaces, phone landscape, quick map palette. */
(() => {
 const $ = id => document.getElementById(id);
 const validTabs = ['marks','colors','units'];
 let activeTab='marks';
 try{const saved=localStorage.getItem('border-active-side-tab-v15');if(validTabs.includes(saved))activeTab=saved}catch{}
 function setTab(next){
  if(!validTabs.includes(next))return;
  activeTab=next;
  document.body.dataset.sidePanel=next;
  document.querySelectorAll('[data-side-tab]').forEach(btn=>{
   const active=btn.dataset.sideTab===next;
   btn.classList.toggle('active',active);
   btn.setAttribute('aria-pressed',String(active));
  });
  try{localStorage.setItem('border-active-side-tab-v15',next)}catch{}
  requestAnimationFrame(()=>{if(typeof applyZoom==='function')applyZoom()});
 }
 for(const btn of document.querySelectorAll('[data-side-tab]')){
  btn.addEventListener('click',()=>{
   if(btn.dataset.sideTab==='layout'){$('openLayouts').click();return}
   setTab(btn.dataset.sideTab);
  });
 }
 const reset=()=>{
  $('mapQuickBrightness').value='100';$('mapQuickHue').value='0';
  changePalette();
 };
 function changePalette(){
  const bright=Number($('mapQuickBrightness').value)||100;
  const hue=Number($('mapQuickHue').value)||0;
  document.documentElement.style.setProperty('--quick-map-brightness',String(bright/100));
  document.documentElement.style.setProperty('--quick-map-hue',hue+'deg');
  $('mapBrightValue').textContent=bright+'%';
  $('mapHueValue').textContent=hue+'°';
  try{localStorage.setItem('border-quick-palette-v15',JSON.stringify({bright,hue}))}catch{}
 }
 try{
  const stored=JSON.parse(localStorage.getItem('border-quick-palette-v15')||'{}');
  if(stored&&Number.isFinite(stored.bright))$('mapQuickBrightness').value=Math.max(50,Math.min(150,stored.bright));
  if(stored&&Number.isFinite(stored.hue))$('mapQuickHue').value=Math.max(-180,Math.min(180,stored.hue));
 }catch{}
 for(const id of ['mapQuickBrightness','mapQuickHue'])$(id).addEventListener('input',changePalette);
 $('resetQuickColors').addEventListener('click',reset);
 $('editFullTheme').addEventListener('click',()=>$('openThemes').click());
 changePalette();setTab(activeTab);
 // Manual override for phones whose OS rotation is locked to portrait.
 const sideButton=$('manualSideways');
 let sideways=false;
 function setSideways(next){
  sideways=!!next;
  document.body.classList.toggle('manual-landscape',sideways);
  sideButton.textContent=sideways?'EXIT SIDEWAYS':'SIDEWAYS VIEW';
  sideButton.setAttribute('aria-pressed',String(sideways));
  requestAnimationFrame(()=>{if(typeof applyZoom==='function')applyZoom()});
  setTimeout(()=>{if(typeof applyZoom==='function')applyZoom()},160);
 }
 sideButton.addEventListener('click',()=>setSideways(!sideways));
 // A real landscape orientation needs no manual rotation.
 window.matchMedia('(orientation: landscape)').addEventListener?.('change',e=>{if(e.matches&&sideways)setSideways(false)});
 // Relayout at 90deg changes the canvas size; keep map overlays aligned.
 let pending=0;
 function recalc(){cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>{if(typeof applyZoom==='function')applyZoom()});}
 window.addEventListener('resize',recalc);
 window.addEventListener('orientationchange',()=>setTimeout(recalc,150));
 if(window.visualViewport)window.visualViewport.addEventListener('resize',recalc);
})();
