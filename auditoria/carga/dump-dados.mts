// Depois da fase A (vendas): extrai do banco de teste os pedidos pagos e os QR dos ingressos para a fase B (webhooks e portaria).
// Uso: npx tsx auditoria/carga/dump-dados.mts <seed.json> <saida.json>
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const seed = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { url: string; eventId: string };
if (/neon\.tech/.test(seed.url)) throw new Error('recusado');
const pool = new pg.Pool({ connectionString: seed.url, max: 1 });
const orders = (await pool.query(`select id from orders where event_id = $1 and status = 'pago' order by created_at`, [seed.eventId])).rows.map(r => r.id as string);
const tickets = (await pool.query(`select qr_payload as qr from tickets where event_id = $1 and status = 'valido' order by issued_at`, [seed.eventId])).rows.map(r => r.qr as string);
const pending = (await pool.query(`select id from orders where event_id = $1 and status = 'pendente'`, [seed.eventId])).rows.map(r => r.id as string);
writeFileSync(process.argv[3]!, JSON.stringify({ orders, tickets, pending }));
console.log(`pedidos pagos: ${orders.length}; ingressos válidos: ${tickets.length}; pendentes: ${pending.length}`);
await pool.end();
