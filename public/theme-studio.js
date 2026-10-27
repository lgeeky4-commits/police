'use strict';
/* 30 bundled SVG wallpapers, local theme slots, sliders and per-panel color editor. */
(() => {
 const root=document.documentElement;
 const by=id=>document.getElementById(id);
 const DEFAULT={grit:10,gritSize:4,hue:0,contrast:100,saturation:100,brightness:100,text:'#e0e9e6',line:'#2b4148',font:'condensed',pattern:'none',wall:1,boxes:{header:'#0a171c',left:'#0b181e',map:'#0b1a1e',right:'#0b181e',chat:'#09151b',tool:'#132832',popup:'#13272a'}};
 const VERSION='border-rp-theme-v12';
 const filters=['grit','gritSize','hue','contrast','saturation','brightness'];
 const boxIds=['header','left','map','right','chat','tool','popup'];
 const safeHex=val=>/^#[0-9a-f]{6}$/i.test(val||'')?val.toLowerCase():null;
 const int=(v,min,max,def)=>{const n=Number(v);return Number.isFinite(n)?Math.round(Math.max(min,Math.min(max,n))):def};
 let theme=structuredClone(DEFAULT),saved={};
 try{const storage=JSON.parse(localStorage.getItem(VERSION)||'{}');if(storage?.active)theme=normalize(storage.active);if(storage?.presets&&typeof storage.presets==='object')saved=storage.presets;}catch{}
 function normalize(input){const x=structuredClone(DEFAULT);if(!input||typeof input!=='object')return x;
  for(const f of filters){const c=f==='gritSize'?[1,12]:f==='hue'?[-180,180]:f==='contrast'?[50,180]:f==='grit'?[0,100]:f==='brightness'?[45,160]:[0,200];x[f]=int(input[f],...c,x[f]);}
  x.text=safeHex(input.text)||x.text;x.line=safeHex(input.line)||x.line;
  x.font=['condensed','mono','modern','industrial'].includes(input.font)?input.font:x.font;
  x.pattern=['none','grid','dots','scan','diagonal','cross'].includes(input.pattern)?input.pattern:x.pattern;
  x.wall=int(input.wall,1,30,1);
  for(const key of boxIds)x.boxes[key]=safeHex(input.boxes?.[key])||x.boxes[key];
  return x;
 }
 const patterns={none:'none',grid:'linear-gradient(90deg,#b6f4df27 1px,transparent 1px),linear-gradient(#b6f4df27 1px,transparent 1px)',dots:'radial-gradient(#a1e7ce55 1px,transparent 1.5px)',scan:'repeating-linear-gradient(0deg,#b6f4df2d 0 1px,transparent 1px 7px)',diagonal:'repeating-linear-gradient(45deg,#b6f4df28 0 1px,transparent 1px 16px)',cross:'repeating-linear-gradient(45deg,#b6f4df1e 0 1px,transparent 1px 20px),repeating-linear-gradient(-45deg,#b6f4df1e 0 1px,transparent 1px 20px)'};
 const fonts={condensed:"'Arial Narrow','Segoe UI',Arial,sans-serif",mono:"Consolas,'Courier New',monospace",modern:"'Segoe UI',Arial,sans-serif",industrial:"Impact,'Arial Narrow',sans-serif"};
 function store(){try{localStorage.setItem(VERSION,JSON.stringify({active:theme,presets:saved}))}catch{}}
 function apply(){
  root.style.setProperty('--bc-bright',theme.brightness/100);
  root.style.setProperty('--bc-contrast',theme.contrast/100);
  root.style.setProperty('--bc-sat',theme.saturation/100);
  root.style.setProperty('--bc-hue',`${theme.hue}deg`);
  root.style.setProperty('--bc-grit',Math.min(.28,theme.grit/100*.25));
  root.style.setProperty('--bc-grit-size',`${theme.gritSize*22}px`);
  root.style.setProperty('--bc-font',fonts[theme.font]);
  root.style.setProperty('--bc-text',theme.text);root.style.setProperty('--bc-rule',theme.line);
  root.style.setProperty('--bc-pattern',patterns[theme.pattern]);
  root.style.setProperty('--bc-wallpaper',`url('/border/wallpapers/wall-${String(theme.wall).padStart(2,'0')}.svg')`);
  for(const key of boxIds)root.style.setProperty('--bc-'+key,theme.boxes[key]);
  for(const element of document.querySelectorAll('[data-theme-setting]'))element.value=theme[element.dataset.themeSetting];
  for(const element of document.querySelectorAll('[data-theme-output]'))element.textContent=theme[element.dataset.themeOutput];
  by('themeBoxColor').value=theme.boxes[by('themeBox').value]||DEFAULT.boxes.header;
  by('themeTextColor').value=theme.text;by('themeLineColor').value=theme.line;by('themeFont').value=theme.font;by('themePattern').value=theme.pattern;
  by('themePreview').style.backgroundColor=theme.boxes[by('themeBox').value];
  by('themePreview').style.color=theme.text;by('themePreview').style.borderColor=theme.line;by('themePreview').style.fontFamily=fonts[theme.font];
  document.querySelectorAll('.wallpaper-option').forEach(el=>el.classList.toggle('selected',+el.dataset.wall===theme.wall));
  store();
 }
 function msg(text){by('themeMessage').textContent=text}
 const panelMap={effects:'themeEffects',editor:'themeEditor',wallpapers:'themeWallpapers'};
 function openPanel(which){
  for(const [key,id] of Object.entries(panelMap))by(id).hidden=key!==which;
  document.querySelectorAll('[data-theme-panel]').forEach(el=>el.classList.toggle('active',el.dataset.themePanel===which));
 }
 by('openThemes').onclick=()=>{by('themeOverlay').hidden=false;apply()};
 by('closeThemes').onclick=()=>by('themeOverlay').hidden=true;
 by('themeOverlay').addEventListener('click',event=>{if(event.target===by('themeOverlay'))by('themeOverlay').hidden=true});
 document.querySelectorAll('[data-theme-panel]').forEach(el=>el.addEventListener('click',()=>openPanel(el.dataset.themePanel)));
 for(const el of document.querySelectorAll('[data-theme-setting]'))el.addEventListener('input',()=>{theme[el.dataset.themeSetting]=Number(el.value);apply()});
 by('resetThemeEffects').onclick=()=>{for(const f of filters)theme[f]=DEFAULT[f];apply();msg('Image effects reset.')};
 by('themeBox').onchange=apply;
 by('themeBoxColor').oninput=()=>{theme.boxes[by('themeBox').value]=by('themeBoxColor').value;apply()};
 by('themeTextColor').oninput=()=>{theme.text=by('themeTextColor').value;apply()};
 by('themeLineColor').oninput=()=>{theme.line=by('themeLineColor').value;apply()};
 by('themeFont').onchange=()=>{theme.font=by('themeFont').value;apply()};
 by('themePattern').onchange=()=>{theme.pattern=by('themePattern').value;apply()};
 const gallery=by('wallpaperGallery');
 for(let i=1;i<=30;i++){
  const b=document.createElement('button');b.type='button';b.className='wallpaper-option';b.dataset.wall=i;
  b.style.backgroundImage=`url('/border/wallpapers/wall-${String(i).padStart(2,'0')}.svg')`;
  const label=document.createElement('span');label.textContent=String(i).padStart(2,'0');b.append(label);
  b.title=`Wallpaper ${i}`;b.onclick=()=>{theme.wall=i;apply();msg(`Wallpaper ${i} selected.`)};gallery.append(b);
 }
 function renderSaved(){const list=by('themeSavedList');list.replaceChildren();for(const [name,val] of Object.entries(saved)){
  const restore=document.createElement('button');restore.type='button';restore.textContent='LOAD '+name;restore.onclick=()=>{theme=normalize(val);apply();msg('Loaded theme: '+name)};
  const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Delete '+name;del.onclick=()=>{delete saved[name];store();renderSaved()};list.append(restore,del);
 }}
 by('saveTheme').onclick=()=>{const name=by('themeSaveName').value.trim().slice(0,28)||`Saved ${Object.keys(saved).length+1}`;
  if(Object.keys(saved).length>=8&&!saved[name])return msg('You can save up to 8 themes. Delete one before adding another.');
  saved[name]=structuredClone(theme);store();renderSaved();msg('Saved theme: '+name);
 };
 by('restoreTheme').onclick=()=>{const name=by('themeSaveName').value.trim();if(name&&saved[name]){theme=normalize(saved[name]);apply();msg('Loaded '+name)}else msg('Choose a saved theme button below or type an existing theme name.')};
 document.addEventListener('keydown',event=>{if(event.key==='Escape')by('themeOverlay').hidden=true});
 window.BorderThemeStudio={applyPreset:(palette)=>{
    if(!palette||typeof palette!=='object')return;
    if(palette.boxes)for(const key of boxIds){const hex=safeHex(palette.boxes[key]);if(hex)theme.boxes[key]=hex;}
    if(safeHex(palette.text))theme.text=palette.text;
    if(safeHex(palette.line))theme.line=palette.line;
    if(palette.font&&fonts[palette.font])theme.font=palette.font;
    if(palette.pattern&&patterns[palette.pattern])theme.pattern=palette.pattern;
    if(Number.isInteger(palette.wall)&&palette.wall>=1&&palette.wall<=30)theme.wall=palette.wall;
    // Keep image effects unchanged when switching layout presets.
    apply();msg('Applied layout palette. You can save or edit it in Theme Studio.');
  }};
 apply();renderSaved();
})();
