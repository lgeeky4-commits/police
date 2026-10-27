const assert = require('assert');
const install=require('./border-room.js');
class Sock {
  constructor(id){this.id=id;this.cb={}}
  on(type,fn){this.cb[type]=fn}
  fire(type,payload){let reply;this.cb[type]?.(payload,r=>reply=r);return reply}
}
const events=[];
const ns={cb:{},on(type,fn){this.cb[type]=fn},emit(type,value){events.push({type,value})},to(){return {emit(type,value){events.push({type,value})}}}};
const io={of(str){assert.equal(str,'/border');return ns}};
install(io);
const socks=Array.from({length:5},(_,i)=>new Sock('s'+i));socks.forEach(s=>ns.cb.connection(s));
for(let i=0;i<4;i++) assert(socks[i].fire('border:join',{name:'TEST'+i}).ok);
assert.equal(socks[4].fire('border:join',{name:'FIFTH'}).ok,false);
let r=socks[0].fire('border:dispatch',{x:35,y:55,label:'SIMULATED CHECKPOINT SUPPORT',note:'Test roleplay dispatch'});
assert(r?.ok);assert.equal(events.some(e=>e.type==='border:dispatch:alert'),true);
let alert=events.find(e=>e.type==='border:dispatch:alert').value;
assert.equal(alert.label,'SIMULATED CHECKPOINT SUPPORT');
let d=events.find(e=>e.type==='border:mark').value;assert.equal(d.type,'DISPATCH');assert.equal(d.priority,'major');
assert(!socks[4].fire('border:dispatch',{x:30,y:40,label:'X'}).ok);
assert(!socks[1].fire('border:dispatch',{x:300,y:40,label:'X'}).ok);
assert(socks[1].fire('border:mark',{type:'INCIDENT',x:20,y:22,label:'BIG SIMULATED INCIDENT'}).ok);
let incident=events.filter(e=>e.type==='border:mark').at(-1).value;assert.equal(incident.priority,'major');
assert(socks[2].fire('border:mark',{type:'NOTE',priority:'small',x:24,y:30,label:'small report'}).ok);
let small=events.filter(e=>e.type==='border:mark').at(-1).value;assert.equal(small.priority,'small');
assert.equal(socks[2].fire('border:remove',{id:d.id}).ok,false);
console.log('PASS: player cap, dispatch permissions/alerts, large incidents, small reports, creator-only removal');
