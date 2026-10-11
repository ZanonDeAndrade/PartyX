import { App } from './App';
import { DocumentationPage, EmailsPage, FoundationsPage } from './docs/DocPages';
import './prototype.css';

export function PrototypeEntry({ path }: { path: string }) {
  if (path === '/docs') return <DocumentationPage />;
  if (path === '/docs/fundamentos') return <FoundationsPage />;
  if (path === '/docs/emails') return <EmailsPage />;
  if (path === '/prototipo') return <App />;
  return null;
}
