import { createRoot } from 'react-dom/client';
import './index.css';
// Camada da abertura (index.html e public/intro/abertura.js): no CSS de entrada, para valer desde o primeiro quadro em qualquer rota.
import './site/styles/abertura.css';
import { SiteApp } from './site/SiteApp';

const path = location.pathname.replace(/\/+$/, '');
const prototypePath = path === '/prototipo' || path === '/docs' || path.startsWith('/docs/');
if (__ENABLE_PROTOTYPE__ && prototypePath) {
  void import('./prototypeEntry').then(({ PrototypeEntry }) =>
    createRoot(document.getElementById('root')!).render(<PrototypeEntry path={path} />),
  );
} else {
  // Antes da primeira pintura: os estilos do site (altura mínima do conteúdo, fundo) valem desde o primeiro quadro.
  document.body.classList.add('px-site');
  createRoot(document.getElementById('root')!).render(<SiteApp />);
}
