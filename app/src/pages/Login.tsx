import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
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

  if (status === 'sent') {
    return (
      <div className="panel">
        <p>
          Un lien de connexion a été envoyé à <strong>{email}</strong>. Ouvrez-le pour vous
          connecter.
        </p>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Se connecter</h2>
      <label htmlFor="email">Adresse email</label>
      <input
        id="email"
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
  );
}
