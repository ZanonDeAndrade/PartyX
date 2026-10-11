import { loadSource, parse } from './dc-parse.mjs';
const { template } = loadSource('reference/PartyX Protótipo.dc.html');
const root = parse(template);
const attrs = new Map(), tags = new Map(); const ents = new Set();
(function walk(n){ if(n.type==='el'){ tags.set(n.tag,(tags.get(n.tag)||0)+1); for(const a of n.attrs){attrs.set(a.name,(attrs.get(a.name)||0)+1);} } if(n.type==='text'){ for(const m of n.text.matchAll(/&[#\w]+;/g)) ents.add(m[0]); } (n.children||[]).forEach(walk); })(root);
console.log('TAGS', [...tags].map(([k,v])=>k+':'+v).join(' '));
console.log('ATTRS', [...attrs].map(([k,v])=>k+':'+v).join(' '));
console.log('ENTS', [...ents].join(' '));
