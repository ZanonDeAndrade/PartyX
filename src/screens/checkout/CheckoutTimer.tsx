import { type CSSProperties } from 'react';
import type { ViewModel } from '../../logic/viewTypes';

export function CheckoutTimer({ vm }: { vm: ViewModel }) {
  return (
    <div
      role="timer"
      style={
        {
          borderRadius: '14px',
          padding: '14px 16px',
          background: `${vm.ck?.timer?.bg ?? ''}`,
          border: `1px solid ${vm.ck?.timer?.bd ?? ''}`,
          color: `${vm.ck?.timer?.fg ?? ''}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        } as CSSProperties
      }
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <b style={{ fontSize: '15px' }}>Ingressos reservados para você</b>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: '600', fontSize: '22px' }}>
          {vm.ck?.timer?.text}
        </span>
      </div>
      <div style={{ height: '6px', background: 'rgba(11,11,16,.08)', borderRadius: '6px' }}>
        <div
          style={
            {
              height: '6px',
              width: `${vm.ck?.timer?.pct ?? ''}`,
              background: `${vm.ck?.timer?.bar ?? ''}`,
              borderRadius: '6px',
            } as CSSProperties
          }
        />
      </div>
      <span style={{ fontSize: '13px', lineHeight: '1.45' }}>
        Conclua o pagamento dentro do prazo. Depois disso a reserva é liberada e os ingressos voltam para venda. Prazo
        de {vm.ck?.timer?.mins} minutos (premissa a confirmar).
      </span>
    </div>
  );
}
