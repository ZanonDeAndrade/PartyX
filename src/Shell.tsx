import type { CSSProperties } from 'react';
import type { ViewModel } from './logic/viewTypes';
import { DemoBar } from './components/DemoBar';
import { PublicHeader } from './components/PublicHeader';
import { HomeScreen } from './screens/HomeScreen';
import { EventsScreen } from './screens/EventsScreen';
import { EventScreen } from './screens/EventScreen';
import { LegalScreen } from './screens/LegalScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { LoginScreen } from './screens/LoginScreen';
import { SignupScreen } from './screens/SignupScreen';
import { RecoverPasswordScreen } from './screens/RecoverPasswordScreen';
import { MessageScreen } from './screens/MessageScreen';
import { PasswordScreen } from './screens/PasswordScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { MyTicketsScreen } from './screens/MyTicketsScreen';
import { MyOrdersScreen } from './screens/MyOrdersScreen';
import { OrderDetailScreen } from './screens/OrderDetailScreen';
import { TicketDetailScreen } from './screens/TicketDetailScreen';
import { AccountScreen } from './screens/AccountScreen';
import { AccountBottomNav } from './components/AccountBottomNav';
import { TicketFullscreenScreen } from './screens/TicketFullscreenScreen';
import { MaintenanceScreen } from './screens/MaintenanceScreen';
import { GateScreen } from './screens/GateScreen';
import { AdminScreen } from './screens/AdminScreen';
import { SiteFooter } from './components/SiteFooter';
import { Drawer } from './components/Drawer';
import { Modal } from './components/Modal';
import { Toast } from './components/Toast';
import { ScreenIndexPanel } from './components/ScreenIndexPanel';
import { NotesPanel } from './components/NotesPanel';

export function Shell({ vm }: { vm: ViewModel }) {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <DemoBar vm={vm} />
      <div style={{ flex: '1', minHeight: '0', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <div
          style={{ width: `${vm.frameBoxW ?? ''}`, height: '100%', overflow: 'hidden', flex: 'none' } as CSSProperties}
        >
          <div
            style={
              {
                width: `${vm.frameW ?? ''}`,
                height: `${vm.frameH ?? ''}`,
                transform: `scale(${vm.frameScale ?? ''})`,
                transformOrigin: '0 0',
                position: 'relative',
                overflow: 'hidden',
                background: `${vm.frameBg ?? ''}`,
                boxShadow: '0 0 0 1px rgba(11,11,16,.08)',
              } as CSSProperties
            }
          >
            <div
              ref={vm.scrollRef}
              style={{ position: 'absolute', inset: '0', overflowY: 'auto', overflowX: 'hidden' }}
            >
              {vm.isPub ? <PublicHeader vm={vm} /> : null}
              {vm.is?.P01 ? <HomeScreen vm={vm} /> : null}
              {vm.is?.P02 ? <EventsScreen vm={vm} /> : null}
              {vm.is?.P03 ? <EventScreen vm={vm} /> : null}
              {vm.legal?.show ? <LegalScreen vm={vm} /> : null}
              {vm.is?.P07 ? <NotFoundScreen vm={vm} /> : null}
              {vm.is?.A01 ? <LoginScreen vm={vm} /> : null}
              {vm.is?.A02 ? <SignupScreen vm={vm} /> : null}
              {vm.is?.A03 ? <RecoverPasswordScreen vm={vm} /> : null}
              {vm.msg?.show ? <MessageScreen vm={vm} /> : null}
              {vm.pwpage?.show ? <PasswordScreen vm={vm} /> : null}
              {vm.ck?.show ? <CheckoutScreen vm={vm} /> : null}
              {vm.is?.U01 ? <MyTicketsScreen vm={vm} /> : null}
              {vm.is?.U02 ? <MyOrdersScreen vm={vm} /> : null}
              {vm.is?.U03 ? <OrderDetailScreen vm={vm} /> : null}
              {vm.is?.U04 ? <TicketDetailScreen vm={vm} /> : null}
              {vm.is?.U06 ? <AccountScreen vm={vm} /> : null}
              {vm.me?.showBottom ? <AccountBottomNav vm={vm} /> : null}
              <i data-anchor="pub" style={{ display: 'none' }} />
              {vm.is?.U05 ? <TicketFullscreenScreen vm={vm} /> : null}
              {vm.is?.G06 ? <MaintenanceScreen vm={vm} /> : null}
              {vm.isGate ? <GateScreen vm={vm} /> : null}
              {vm.isAdm ? <AdminScreen vm={vm} /> : null}
              {vm.showFooter ? <SiteFooter vm={vm} /> : null}
            </div>
            {vm.dr?.show ? <Drawer vm={vm} /> : null}
            {vm.md?.show ? <Modal vm={vm} /> : null}
            {vm.tst?.show ? <Toast vm={vm} /> : null}
          </div>
        </div>
      </div>
      {vm.idx?.show ? <ScreenIndexPanel vm={vm} /> : null}
      {vm.nt?.show ? <NotesPanel vm={vm} /> : null}
    </div>
  );
}
