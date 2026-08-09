import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { ProgressStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { parseAssociation, parseRecitation, shuffle } from '../lib/parseContent';
import type { CardOutletContext } from './CardPage';

interface Pair {
  id: number;
  prompt: string;
  answer: string;
}

function buildPairs(content: string): Pair[] {
  return parseAssociation(content).map((p, i) => ({ id: i, prompt: p.front, answer: p.back }));
}

function DeckPile({ count, label, variant }: { count: number; label: string; variant?: 'done' }) {
  const layers = Math.min(count, 4);
  return (
    <div className="deck-pile">
      <div className="deck-pile-stack">
        {layers === 0 ? (
          <span className="deck-pile-card deck-pile-card-empty" />
        ) : (
          Array.from({ length: layers }).map((_, i) => (
            <span
              key={i}
              className={`deck-pile-card${variant === 'done' ? ' deck-pile-card-done' : ''}`}
              style={{
                zIndex: layers - i,
                transform: `translate(${i * 3}px, ${-i * 3}px) rotate(${i * 2 - 3}deg)`,
              }}
            />
          ))
        )}
      </div>
      <span className="deck-pile-label">
        {count} {label}
      </span>
    </div>
  );
}

export default function ReviewSession() {
  const { card } = useOutletContext<CardOutletContext>();
  const { user } = useAuth();
  const isAssociation = card.type === 'association';

  const [queue, setQueue] = useState<Pair[]>(() => (isAssociation ? shuffle(buildPairs(card.content)) : []));
  const [doneStack, setDoneStack] = useState<Pair[]>([]);
  const recitationLines = useMemo(() => (isAssociation ? [] : parseRecitation(card.content)), [isAssociation, card.content]);
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

  const totalCount = isAssociation ? queue.length + doneStack.length : recitationLines.length;

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
    if (isAssociation) {
      setQueue(shuffle(buildPairs(card.content)));
      setDoneStack([]);
    } else {
      setIndex(0);
    }
    setRevealed(false);
    setFinished(false);
  }

  function nextRecitationLine() {
    setRevealed(false);
    if (index + 1 >= recitationLines.length) {
      setFinished(true);
    } else {
      setIndex(index + 1);
    }
  }

  function nextAssociationPair() {
    setRevealed(false);
    const [current, ...rest] = queue;
    setDoneStack((d) => [...d, current]);
    setQueue(rest);
    if (rest.length === 0) setFinished(true);
  }

  function requeuePrevious() {
    if (doneStack.length === 0) return;
    const last = doneStack[doneStack.length - 1];
    setDoneStack((d) => d.slice(0, -1));
    setQueue((q) => {
      const insertAt = q.length === 0 ? 0 : 1 + Math.floor(Math.random() * q.length);
      return [...q.slice(0, insertAt), last, ...q.slice(insertAt)];
    });
  }

  if (isAssociation && totalCount === 0) return <p>Cette carte n'a pas encore de contenu à réviser.</p>;
  if (!isAssociation && recitationLines.length === 0) return <p>Cette carte n'a pas encore de contenu à réviser.</p>;

  if (finished) {
    return (
      <div className="panel review-summary">
        <p className="review-summary-count">
          {isAssociation ? `${totalCount} paires révisées.` : `${totalCount} phrases parcourues.`}
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

  if (!isAssociation) {
    const shown = recitationLines.slice(0, index + 1);
    return (
      <div className="panel">
        <p className="hint">
          {index + 1} / {recitationLines.length}
        </p>
        <div className="review-text">
          {shown.map((item, i) => (
            <p key={i} className={i === index ? 'review-line-current' : 'review-line-done'}>
              {item.text}
            </p>
          ))}
        </div>
        <button onClick={nextRecitationLine}>{index + 1 >= recitationLines.length ? 'Terminer' : 'Suivant'}</button>
      </div>
    );
  }

  const current = queue[0];

  return (
    <div className="panel">
      <div className="deck-piles">
        <DeckPile count={queue.length} label="à réviser" />
        <DeckPile count={doneStack.length} label="ok" variant="done" />
      </div>
      <div className="review-card">
        <p className="review-prompt">{current.prompt}</p>
        {revealed && <p className="review-answer">{current.answer}</p>}
      </div>
      {!revealed ? (
        <button onClick={() => setRevealed(true)}>Révéler</button>
      ) : (
        <button onClick={nextAssociationPair}>{queue.length <= 1 ? 'Terminer' : 'Suivant'}</button>
      )}
      {doneStack.length > 0 && (
        <button className="button-secondary review-requeue" onClick={requeuePrevious}>
          ↩️ Remettre la carte précédente dans la pile
        </button>
      )}
    </div>
  );
}
