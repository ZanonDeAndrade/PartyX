import { createRoot } from 'react-dom/client';
import './index.css';
import { SiteApp } from './site/SiteApp';

const path = location.pathname.replace(/\/+$/, '');
const prototypePath = path === '/prototipo' || path === '/docs' || path.startsWith('/docs/');
if (__ENABLE_PROTOTYPE__ && prototypePath) {
  void import('./prototypeEntry').then(({ PrototypeEntry }) =>
    createRoot(document.getElementById('root')!).render(<PrototypeEntry path={path} />),
  );
} else {
  createRoot(document.getElementById('root')!).render(<SiteApp />);
}
