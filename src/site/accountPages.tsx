import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import { Field, PasswordField } from './authPages';
import { Layout, usePageTitle } from './components';
import { MeShell } from './ticketPages';
import { useRouter } from './router';
import { useSession } from './session';
import { phoneInput } from './format';

/** Troca de senha (U07), em janela sobre a conta. A senha atual é conferida pelo servidor. */
export function PasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLFormElement>(null);
  useEffect(() => {
    first.current?.querySelector('input')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneral('');
    if (next !== confirm) {
      setErrors({ confirm: 'As senhas não são iguais.' });
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.fields);
      else setGeneral(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-modal-bg" onClick={onClose}>
      <div
        className="px-modal px-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-title"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-modal-head">
          <h2 id="pw-title">Alterar senha</h2>
          <button type="button" className="px-icon-btn px-icon-btn-light" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </div>
        <form onSubmit={submit} className="px-form" noValidate ref={first}>
          <PasswordField
            id="pw-atual"
            label="Senha atual"
            value={current}
            onChange={setCurrent}
            error={errors.currentPassword}
            autoComplete="current-password"
          />
          <PasswordField
            id="pw-nova"
            label="Nova senha"
            value={next}
            onChange={setNext}
            error={errors.newPassword}
            autoComplete="new-password"
            rules
          />
          <PasswordField
            id="pw-confirma"
            label="Confirmar nova senha"
            value={confirm}
            onChange={setConfirm}
            error={errors.confirm}
            autoComplete="new-password"
          />
          {general ? (
            <p className="px-notice px-notice-err" role="alert">
              {general}
            </p>
          ) : null}
          <div className="px-modal-actions px-modal-actions-2">
            <button type="button" className="px-btn px-btn-outline" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="px-btn px-btn-pri" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Minha conta (U06): nome e telefone editáveis; e-mail e CPF só o atendimento corrige. */
export function MyAccountPage() {
  usePageTitle('Minha conta · PartyX');
  const { go } = useRouter();
  const session = useSession();
  const user = session.user;
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(phoneInput(user?.phone ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);

  useEffect(() => {
    if (session.status === 'anon') go('/entrar?voltar=%2Fminha-conta');
  }, [session.status, go]);
  // Preenche quando a sessão termina de carregar.
  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(phoneInput(user.phone ?? ''));
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user)
    return (
      <Layout>
        <div className="px-wrap" aria-busy="true" />
      </Layout>
    );

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneral('');
    setSaved('');
    setBusy(true);
    try {
      await api.updateProfile(name, phone);
      await session.reload();
      setSaved('Alterações salvas.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.fields);
      else setGeneral(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MeShell narrow>
      <h1 className="px-me-title">Minha conta</h1>
      <section className="px-ck-card" aria-labelledby="dados">
        <h2 id="dados">Dados pessoais</h2>
        <form onSubmit={save} className="px-form" noValidate>
          <Field
            id="conta-nome"
            label="Nome completo"
            value={name}
            onChange={setName}
            error={errors.name}
            autoComplete="name"
          />
          <Field
            id="conta-tel"
            label="Telefone com DDD"
            value={phone}
            onChange={v => setPhone(phoneInput(v))}
            error={errors.phone}
            autoComplete="tel"
            inputMode="tel"
          />
          <div className="px-ro-grid">
            <div className="px-field">
              <span className="px-ro-label">E-mail</span>
              <span className="px-ro">{user.email}</span>
            </div>
            {user.cpf ? (
              <div className="px-field">
                <span className="px-ro-label">CPF</span>
                <span className="px-ro">{user.cpf}</span>
              </div>
            ) : null}
          </div>
          <p className="px-hint">
            E-mail e CPF não podem ser alterados por aqui. Para corrigir, fale com o atendimento da PartyX.
          </p>
          {general ? (
            <p className="px-notice px-notice-err" role="alert">
              {general}
            </p>
          ) : null}
          <p role="status" aria-live="polite" className="px-ok">
            {saved}
          </p>
          <button type="submit" className="px-btn px-btn-pri px-btn-lg px-self-start" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </form>
      </section>
      <section className="px-ck-card px-ck-row" aria-labelledby="senha-t">
        <div>
          <h2 id="senha-t">Senha</h2>
          <span className="px-ck-text">Troque sua senha a qualquer momento.</span>
        </div>
        <button type="button" className="px-btn px-btn-outline" onClick={() => setDialog(true)} aria-haspopup="dialog">
          Alterar senha
        </button>
      </section>
      <button
        type="button"
        className="px-btn px-btn-outline px-btn-logout px-self-start"
        onClick={() => {
          void session.logout().then(() => go('/'));
        }}
      >
        Sair da conta
      </button>
      {dialog ? (
        <PasswordDialog
          onClose={() => setDialog(false)}
          onDone={() => {
            setDialog(false);
            setSaved('Senha alterada.');
          }}
        />
      ) : null}
    </MeShell>
  );
}
