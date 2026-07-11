/**
 * Dutch OTP login for the beheer UI (WP-A4).
 *
 * Email OTP (6-digit code), not magic links: a code typed on the same
 * device has no "opened in the wrong browser" failure mode. Accounts must
 * be pre-created (shouldCreateUser: false — R5); authorization is the
 * ADMIN_EMAILS allowlist on the server.
 *
 * When Supabase Auth is not configured (no VITE_SUPABASE_*), falls back to
 * the static beheertoken.
 */

import { useState } from 'react';
import { supabaseAuth } from '../lib/supabase-client';
import { setAdminToken } from '../lib/adminAuth';

interface AdminLoginProps {
  onTokenLogin: (token: string) => void;
}

export function AdminLogin({ onTokenLogin }: AdminLoginProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [useToken, setUseToken] = useState(!supabaseAuth);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseAuth) return;
    setBusy(true);
    setError('');
    const { error: otpError } = await supabaseAuth.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (otpError) {
      setError('Versturen mislukt. Controleer het e-mailadres — alleen vooraf aangemaakte beheerdersaccounts kunnen inloggen.');
    } else {
      setStep('code');
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseAuth) return;
    setBusy(true);
    setError('');
    const { error: verifyError } = await supabaseAuth.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (verifyError) {
      setError('Code onjuist of verlopen. Probeer het opnieuw.');
    }
    // Success: the page's useAdminSession picks up the new session.
  };

  const submitToken = (e: React.FormEvent) => {
    e.preventDefault();
    const value = new FormData(e.currentTarget as HTMLFormElement).get('token');
    const entered = typeof value === 'string' ? value.trim() : '';
    if (entered) {
      setAdminToken(entered);
      onTokenLogin(entered);
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 bg-white rounded-lg shadow-md p-6">
      <h2 className="text-lg font-semibold mb-2 text-tdf-primary">Inloggen — Etappe Beheer</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {!useToken && supabaseAuth && step === 'email' && (
        <form onSubmit={sendCode}>
          <p className="text-sm text-gray-600 mb-4">
            Vul je e-mailadres in; je ontvangt een code van 6 cijfers.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="naam@voorbeeld.nl"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full px-6 py-3 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600 font-semibold disabled:opacity-50"
          >
            {busy ? 'Versturen…' : 'Stuur code'}
          </button>
        </form>
      )}

      {!useToken && supabaseAuth && step === 'code' && (
        <form onSubmit={verifyCode}>
          <p className="text-sm text-gray-600 mb-4">
            Vul de code in die naar <strong>{email}</strong> is gestuurd.
          </p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 text-center text-xl tracking-widest"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full px-6 py-3 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600 font-semibold disabled:opacity-50"
          >
            {busy ? 'Controleren…' : 'Inloggen'}
          </button>
          <button
            type="button"
            onClick={() => { setStep('email'); setCode(''); setError(''); }}
            className="w-full mt-2 px-6 py-2 text-sm text-tdf-primary hover:underline"
          >
            Ander e-mailadres
          </button>
        </form>
      )}

      {useToken && (
        <form onSubmit={submitToken}>
          <p className="text-sm text-gray-600 mb-4">Voer het beheertoken in.</p>
          <input
            name="token"
            type="password"
            autoComplete="off"
            placeholder="Beheertoken"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
          />
          <button
            type="submit"
            className="w-full px-6 py-3 bg-tdf-accent text-white rounded-lg hover:bg-yellow-600 font-semibold"
          >
            Doorgaan
          </button>
        </form>
      )}

      {supabaseAuth && (
        <button
          type="button"
          onClick={() => { setUseToken(!useToken); setError(''); }}
          className="w-full mt-4 text-xs text-gray-500 hover:underline"
        >
          {useToken ? 'Inloggen met e-mailcode' : 'Inloggen met beheertoken'}
        </button>
      )}
    </div>
  );
}
