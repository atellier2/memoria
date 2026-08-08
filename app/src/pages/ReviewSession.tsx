import { useMemo, useState } from 'react';
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

  const items = useMemo(() => {
    if (card.type === 'association') {
      return shuffle(parseAssociation(card.content)).map((p) => ({ prompt: p.front, answer: p.back }));
    }
    return parseRecitation(card.content).map((l) => ({ prompt: l.text, answer: l.text }));
  }, [card]);

  async function markStatus(status: ProgressStatus) {
    if (!user) return;
    setSaving(true);
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
          status,
          last_reviewed_at: new Date().toISOString(),
          review_count: (existing?.review_count ?? 0) + 1,
        },
        { onConflict: 'user_id,card_id' },
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
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
      <div className="panel">
        <p>
          {card.type === 'association'
            ? `${items.length} paires révisées.`
            : `${items.length} phrases parcourues.`}
        </p>
        {user ? (
          <div className="review-actions">
            <button disabled={saving} onClick={() => markStatus('termine')}>
              Marquer "terminé"
            </button>
            <button disabled={saving} onClick={() => markStatus('en_cours')}>
              Marquer "en cours"
            </button>
          </div>
        ) : (
          <p className="hint">Connectez-vous pour enregistrer votre progression.</p>
        )}
        {actionError && <p className="error">{actionError}</p>}
        <Link to={`/cards/${card.id}`}>Retour à la carte</Link>
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
