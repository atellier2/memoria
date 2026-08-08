import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { ProgressStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { parseAssociation, parseRecitation, shuffle } from '../lib/parseContent';
import type { CardOutletContext } from './CardPage';

export default function ReviewSession() {
  const { card } = useOutletContext<CardOutletContext>();
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProgressStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setStatusLoaded(true);
      return;
    }
    setStatusLoaded(false);
    supabase
      .from('progress')
      .select('status')
      .eq('user_id', user.id)
      .eq('card_id', card.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setStatus(data?.status ?? null);
        setStatusLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, card.id]);

  const items = useMemo(() => {
    if (card.type === 'association') {
      return shuffle(parseAssociation(card.content)).map((p) => ({ prompt: p.front, answer: p.back }));
    }
    return parseRecitation(card.content).map((l) => ({ prompt: l.text, answer: l.text }));
  }, [card]);

  async function markStatus(newStatus: ProgressStatus) {
    if (!user) return;
    setSaving(true);
    setActionError(null);
    try {
      const { data: existing } = await supabase
        .from('progress')
        .select('review_count')
        .eq('user_id', user.id)
        .eq('card_id', card.id)
        .maybeSingle();

      await supabase.from('progress').upsert(
        {
          user_id: user.id,
          card_id: card.id,
          status: newStatus,
          last_reviewed_at: new Date().toISOString(),
          review_count: (existing?.review_count ?? 0) + 1,
        },
        { onConflict: 'user_id,card_id' },
      );
      setStatus(newStatus);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  function restart() {
    setIndex(0);
    setRevealed(false);
    setFinished(false);
  }

  function next() {
    setRevealed(false);
    if (index + 1 >= items.length) {
      setFinished(true);
    } else {
      setIndex(index + 1);
    }
  }

  if (items.length === 0) return <p>Cette carte n'a pas encore de contenu à réviser.</p>;

  if (finished) {
    return (
      <div className="panel review-summary">
        <p className="review-summary-count">
          {card.type === 'association'
            ? `${items.length} paires révisées.`
            : `${items.length} phrases parcourues.`}
        </p>
        {user ? (
          statusLoaded && (
            <div className="review-actions">
              {status !== 'termine' && (
                <button disabled={saving} onClick={() => markStatus('termine')}>
                  Marquer "terminé"
                </button>
              )}
              {status !== 'en_cours' && (
                <button disabled={saving} onClick={() => markStatus('en_cours')}>
                  Marquer "en cours"
                </button>
              )}
              <button className="button-secondary" disabled={saving} onClick={restart}>
                🔁 Relancer un cycle de révision
              </button>
            </div>
          )
        ) : (
          <div className="review-actions">
            <p className="hint">Connectez-vous pour enregistrer votre progression.</p>
            <button className="button-secondary" onClick={restart}>
              🔁 Relancer un cycle de révision
            </button>
          </div>
        )}
        {actionError && <p className="error">{actionError}</p>}
        <Link className="review-back-link" to={`/cards/${card.id}`}>
          Retour à la carte
        </Link>
      </div>
    );
  }

  if (card.type === 'recitation') {
    const shown = items.slice(0, index + 1);
    return (
      <div className="panel">
        <p className="hint">
          {index + 1} / {items.length}
        </p>
        <div className="review-text">
          {shown.map((item, i) => (
            <p key={i} className={i === index ? 'review-line-current' : 'review-line-done'}>
              {item.prompt}
            </p>
          ))}
        </div>
        <button onClick={next}>{index + 1 >= items.length ? 'Terminer' : 'Suivant'}</button>
      </div>
    );
  }

  const current = items[index];

  return (
    <div className="panel">
      <p className="hint">
        {index + 1} / {items.length}
      </p>
      <div className="review-card">
        <p className="review-prompt">{current.prompt}</p>
        {revealed && <p className="review-answer">{current.answer}</p>}
      </div>
      {!revealed ? (
        <button onClick={() => setRevealed(true)}>Révéler</button>
      ) : (
        <button onClick={next}>{index + 1 >= items.length ? 'Terminer' : 'Suivant'}</button>
      )}
    </div>
  );
}
