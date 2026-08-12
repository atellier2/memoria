import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { ProgressStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { parseAssociation, parseRecitation, shuffle } from '../lib/parseContent';
import type { CardOutletContext } from './CardPage';

const SWIPE_THRESHOLD = 80;
const FLING_DISTANCE = 500;
const FLING_DURATION = 200;

interface Pair {
  id: number;
  prompt: string;
  answer: string;
}

function buildPairs(content: string): Pair[] {
  return parseAssociation(content).map((p, i) => ({ id: i, prompt: p.front, answer: p.back }));
}

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconFlip() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconUndo() {
  return (
    <svg {...ICON_PROPS} width={13} height={13}>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
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
  const [index, setIndex] = useState(-1);

  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProgressStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const dragStartX = useRef(0);
  const currentLineRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (index >= 0) {
      currentLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [index]);

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
      setIndex(-1);
    }
    setDragX(0);
    setDragging(false);
    setIsAnimating(false);
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

  // Moves the current pair to the "done" pile and shows the next one.
  function finalizeAdvance() {
    setRevealed(false);
    setDragX(0);
    setIsAnimating(false);
    const [completed, ...rest] = queue;
    setDoneStack((d) => [...d, completed]);
    setQueue(rest);
    if (rest.length === 0) setFinished(true);
  }

  // Puts the current pair back into the "to review" pile (at a random spot
  // further down) and shows the next one.
  function finalizeRequeue() {
    setRevealed(false);
    setDragX(0);
    setIsAnimating(false);
    const [completed, ...rest] = queue;
    const insertAt = rest.length === 0 ? 0 : 1 + Math.floor(Math.random() * rest.length);
    setQueue([...rest.slice(0, insertAt), completed, ...rest.slice(insertAt)]);
  }

  function completeCurrent() {
    if (dragging || isAnimating) return;
    setIsAnimating(true);
    setDragX(FLING_DISTANCE);
    window.setTimeout(finalizeAdvance, FLING_DURATION);
  }

  function requeueCurrent() {
    if (dragging || isAnimating) return;
    setIsAnimating(true);
    setDragX(-FLING_DISTANCE);
    window.setTimeout(finalizeRequeue, FLING_DURATION);
  }

  function handleCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!revealed || isAnimating) return;
    dragStartX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragX(e.clientX - dragStartX.current);
  }

  function handleCardPointerUp() {
    if (!dragging) return;
    setDragging(false);
    if (Math.abs(dragX) > SWIPE_THRESHOLD) {
      const direction = dragX > 0 ? 1 : -1;
      setIsAnimating(true);
      setDragX(direction * FLING_DISTANCE);
      window.setTimeout(finalizeAdvance, FLING_DURATION);
    } else {
      setDragX(0);
    }
  }

  function handleCardClick() {
    if (!revealed) setRevealed(true);
  }

  if (isAssociation && totalCount === 0) return <p>Cette carte n'a pas encore de contenu à réviser.</p>;
  if (!isAssociation && recitationLines.length === 0) return <p>Cette carte n'a pas encore de contenu à réviser.</p>;

  if (finished) {
    return (
      <div className="panel review-summary">
        {!isAssociation && (
          <div className="review-text">
            {recitationLines.map((item, i) => (
              <p key={i} className="review-line-done">
                {item.text}
              </p>
            ))}
          </div>
        )}
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
            <p
              key={i}
              ref={i === index ? currentLineRef : undefined}
              className={i === index ? 'review-line-current' : 'review-line-done'}
            >
              {item.text}
            </p>
          ))}
        </div>
        <button onClick={nextRecitationLine}>
          {index + 1 >= recitationLines.length ? 'Terminer' : 'Afficher la prochaine phrase'}
        </button>
      </div>
    );
  }

  const current = queue[0];
  const isLastCard = queue.length <= 1;

  return (
    <div className="panel">
      <div className="deck-piles">
        <DeckPile count={queue.length} label="à réviser" />
        <DeckPile count={doneStack.length} label="ok" variant="done" />
      </div>
      <div className="review-card-viewport">
        <div
          key={current.id}
          className={`review-card${dragging ? ' review-card-dragging' : ''}`}
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
            opacity: 1 - Math.min(Math.abs(dragX) / FLING_DISTANCE, 0.7),
          }}
          onPointerDown={handleCardPointerDown}
          onPointerMove={handleCardPointerMove}
          onPointerUp={handleCardPointerUp}
          onPointerCancel={handleCardPointerUp}
          onClick={handleCardClick}
        >
          {revealed && (
            <button
              type="button"
              className="review-card-requeue"
              disabled={isAnimating}
              onClick={(e) => {
                e.stopPropagation();
                requeueCurrent();
              }}
              aria-label="Je ne savais pas — remettre dans la pile à réviser"
              title="Je ne savais pas — remettre dans la pile à réviser"
            >
              <IconUndo />
            </button>
          )}
          <p className="review-prompt">{current.prompt}</p>
          {revealed && <p className="review-answer">{current.answer}</p>}
          <button
            type="button"
            className={`review-card-flip${!revealed ? ' review-card-flip-hint' : ''}`}
            disabled={isAnimating}
            onClick={(e) => {
              e.stopPropagation();
              if (isAnimating) return;
              if (!revealed) setRevealed(true);
              else completeCurrent();
            }}
            aria-label={!revealed ? 'Révéler la réponse' : isLastCard ? 'Terminer' : 'Carte suivante'}
            title={!revealed ? 'Révéler la réponse' : isLastCard ? 'Terminer' : 'Carte suivante'}
          >
            {!revealed ? <IconFlip /> : isLastCard ? <IconCheck /> : <IconArrowRight />}
          </button>
        </div>
      </div>
      {revealed && <p className="review-hint-swipe">Glissez la carte ou appuyez sur → pour continuer</p>}
    </div>
  );
}
