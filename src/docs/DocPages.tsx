import { useLogic } from '../logic/useLogic';
import { DocumentationLogic } from './DocumentationLogic';
import { DocumentationView } from './DocumentationView';
import { EmailsLogic } from './EmailsLogic';
import { EmailsView } from './EmailsView';
import { FoundationsLogic } from './FoundationsLogic';
import { FoundationsView } from './FoundationsView';
import { useDocPage } from './useDocPage';

export function DocumentationPage() {
  const logic = useLogic(() => new DocumentationLogic());
  useDocPage({ id: 'documentation', title: 'PartyX · Documentação de design', background: '#F7F7FA' });
  return <DocumentationView vm={logic.renderVals()} />;
}

export function FoundationsPage() {
  const logic = useLogic(() => new FoundationsLogic());
  useDocPage({ id: 'foundations', title: 'PartyX · Fundamentos e componentes', background: '#F7F7FA' });
  return <FoundationsView vm={logic.renderVals()} />;
}

export function EmailsPage() {
  const logic = useLogic(() => new EmailsLogic());
  useDocPage({ id: 'emails', title: 'PartyX · E-mails, PDF e compartilhamento', background: '#E9E9EF' });
  return <EmailsView vm={logic.renderVals()} />;
}
