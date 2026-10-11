import { PartyXLogic } from './logic/PartyXLogic';
import { useLogic } from './logic/useLogic';
import { Shell } from './Shell';

/** Protótipo navegável do PartyX: a lógica guarda o estado e o `Shell` desenha a tela atual. */
export function App() {
  const logic = useLogic(() => new PartyXLogic());
  return <Shell vm={logic.renderVals()} />;
}
