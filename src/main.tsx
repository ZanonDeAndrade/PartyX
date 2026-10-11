import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { SiteApp } from './site/SiteApp';
import { DocumentationPage, EmailsPage, FoundationsPage } from './docs/DocPages';

/** Rotas por endereço: a vitrine real em `/`, o protótipo navegável em `/prototipo` e a documentação em `/docs/...`. */
function Root() {
  const path = location.pathname.replace(/\/+$/, '');
  if (path === '/docs') return <DocumentationPage />;
  if (path === '/docs/fundamentos') return <FoundationsPage />;
  if (path === '/docs/emails') return <EmailsPage />;
  if (path === '/prototipo') return <App />;
  return <SiteApp />;
}

createRoot(document.getElementById('root')!).render(<Root />);
