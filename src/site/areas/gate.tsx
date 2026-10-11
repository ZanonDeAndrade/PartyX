/** Portaria (V01 a V09): carregada sob demanda, com o leitor de QR (jsQR) e o próprio CSS. */
import { NotFoundPage } from '../pages';
import '../styles/gate.css';
import { GateEventsPage, GatePage } from '../gatePages';

export default function GateArea({ path }: { path: string }) {
  if (path === '/portaria') return <GateEventsPage />;
  const gate = /^\/portaria\/([0-9a-f-]{36})$/.exec(path);
  if (gate) return <GatePage key={gate[1]} eventId={gate[1]!} />;
  return <NotFoundPage />;
}
