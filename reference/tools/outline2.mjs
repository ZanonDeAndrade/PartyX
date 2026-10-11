import { loadSource, parse, attr } from './dc-parse.mjs';
const { template } = loadSource('reference/PartyX Protótipo.dc.html');
const root = parse(template);
const E=n=>n.children.filter(c=>c.type==='el');
const wrapper = E(root).find(c=>c.tag==='div');
const frameRow=E(wrapper)[1];
const scale=E(frameRow)[0]; const frame=E(scale)[0]; const scrollP=frame; const scroll=E(frame)[0];
console.log('scroll attrs', scroll.attrs.map(a=>a.name));
function text(n){return n.type==='text'?n.text:(n.children||[]).map(text).join('')}
function lines(n,d,max,pre){
  if(n.type!=='el')return;
  const isIf=n.tag==='sc-if'; const v=attr(n,'value')||'';
  if(isIf||d===0) console.log(pre+' '.repeat(d*2)+n.tag+' '+v+' '+(attr(n,'data-screen-label')||''));
  if(d<max) n.children.forEach(c=>lines(c,d+1,max,pre));
}
for (const c of scroll.children) {
  if (c.type!=='el') continue;
  const v = attr(c,'value');
  if (['{{ ck.show }}','{{ isGate }}','{{ isAdm }}','{{ dr.show }}','{{ md.show }}'].includes(v)) { console.log('=== '+v); c.children.forEach(x=>lines(x,0,3,'')); }
}
const ov = frame;
for (const c of E(ov)) { if (c.type==='el'&&['{{ dr.show }}','{{ md.show }}'].includes(attr(c,'value'))) { console.log('=== '+attr(c,'value')); c.children.forEach(x=>lines(x,0,6,'')); } }
