import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type Mode = 'password' | 'magiclink';
type PasswordAction = 'signin' | 'signup';

export default function Login() {
  const { signInWithEmail, signInWithPassword, signUpWithPassword } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('password');
  const [passwordAction, setPasswordAction] = useState<PasswordAction>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLinkSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const { error } = await signInWithEmail(email);
    if (error) {
      setError(error);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const { error } =
      passwordAction === 'signin'
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password);
    if (error) {
      setError(error);
      setStatus('error');
      return;
    }
    if (passwordAction === 'signup') {
      setStatus('sent');
    } else {
      navigate('/');
    }
  }

  if (mode === 'magiclink' && status === 'sent') {
    return (
      <div className="panel">
        <p>
          Un lien de connexion a été envoyé à <strong>{email}</strong>. Ouvrez-le pour vous
          connecter.
        </p>
      </div>
    );
  }

  if (mode === 'password' && passwordAction === 'signup' && status === 'sent') {
    return (
      <div className="panel">
        <p>
          Un email de confirmation a été envoyé à <strong>{email}</strong>. Ouvrez-le pour
          activer votre compte, puis connectez-vous avec votre mot de passe.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Se connecter</h2>
      <div className="mode-tabs" role="group" aria-label="Méthode de connexion">
        <button
          type="button"
          className={mode === 'password' ? 'active' : ''}
          onClick={() => {
            setMode('password');
            setStatus('idle');
            setError(null);
          }}
        >
          Mot de passe
        </button>
        <button
          type="button"
          className={mode === 'magiclink' ? 'active' : ''}
          onClick={() => {
            setMode('magiclink');
            setStatus('idle');
            setError(null);
          }}
        >
          Lien magique
        </button>
      </div>

      {mode === 'password' ? (
        <form onSubmit={handlePasswordSubmit}>
          <label htmlFor="email">Adresse email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
          />
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={passwordAction === 'signin' ? 'current-password' : 'new-password'}
          />
          <button type="submit" disabled={status === 'sending'}>
            {status === 'sending'
              ? 'Envoi…'
              : passwordAction === 'signin'
                ? 'Se connecter'
                : 'Créer le compte'}
          </button>
          {error && <p className="error">{error}</p>}
          <p className="hint">
            {passwordAction === 'signin' ? (
              <>
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setPasswordAction('signup');
                    setStatus('idle');
                    setError(null);
                  }}
                >
                  Créer un compte
                </button>
              </>
            ) : (
              <>
                Déjà un compte ?{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setPasswordAction('signin');
                    setStatus('idle');
                    setError(null);
                  }}
                >
                  Se connecter
                </button>
              </>
            )}
          </p>
        </form>
      ) : (
        <form onSubmit={handleMagicLinkSubmit}>
          <label htmlFor="magiclink-email">Adresse email</label>
          <input
            id="magiclink-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
          />
          <button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Envoi…' : 'Recevoir un lien magique'}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </div>
  );
}
