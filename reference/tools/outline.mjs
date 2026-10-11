import { loadSource, parse, attr } from './dc-parse.mjs';
const { template } = loadSource('reference/PartyX Protótipo.dc.html');
const root = parse(template);
function size(n){ return n.type==='text'?n.text.length : (n.children||[]).reduce((a,c)=>a+size(c),0)+10; }
function show(n, d, max){
  if (n.type!=='el') return;
  const lbl = attr(n,'data-screen-label')||attr(n,'value')||attr(n,'list')||'';
  console.log(' '.repeat(d*2)+n.tag+' '+lbl+'  ['+size(n)+']');
  if (d<max) n.children.forEach(c=>show(c,d+1,max));
}
// pula helmet; mostra até profundidade 5
const wrapper = root.children.find(c=>c.type==='el'&&c.tag==='div');
show(wrapper,0,5);
console.log('top-level roots:', root.children.filter(c=>c.type==='el').map(c=>c.tag));
