import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { ProgressStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { parseAssociation, parseRecitation, pairLineKey, shuffle } from '../lib/parseContent';
import type { CardOutletContext } from './CardPage';

const SWIPE_THRESHOLD = 80;
const FLING_DISTANCE = 500;
const FLING_DURATION = 200;

interface Pair {
  id: number;
  key: string;
  prompt: string;
  answer: string;
}

type ReviewScope = 'failures' | 'all';

function buildPairs(content: string): Pair[] {
  return parseAssociation(content).map((p, i) => ({ id: i, key: pairLineKey(p), prompt: p.front, answer: p.back }));
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

function IconThumbUp() {
  return (
    <svg {...ICON_PROPS} width={18} height={18}>
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  );
}

function IconThumbDown() {
  return (
    <svg {...ICON_PROPS} width={18} height={18}>
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
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
  const { user, loading: authLoading } = useAuth();
  const isAssociation = card.type === 'association';

  const allPairs = useMemo(() => (isAssociation ? buildPairs(card.content) : []), [isAssociation, card.content]);
  const [queue, setQueue] = useState<Pair[]>([]);
  const [doneStack, setDoneStack] = useState<Pair[]>([]);
  const [masteredKeys, setMasteredKeys] = useState<Set<string>>(new Set());
  const [masteryLoaded, setMasteryLoaded] = useState(!isAssociation);
  const [scopeChoice, setScopeChoice] = useState<ReviewScope | null>(null);
  const queueBuiltRef = useRef(false);
  const [resetting, setResetting] = useState(false);
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

  // Charge les lignes déjà mémorisées pour cette carte. On attend que
  // l'authentification soit résolue (authLoading) avant de lancer la requête,
  // pour ne jamais construire la file en pensant à tort qu'il n'y a
  // personne de connecté.
  useEffect(() => {
    if (!isAssociation || authLoading) return;
    let cancelled = false;
    async function load() {
      let mastered = new Set<string>();
      if (user) {
        const { data } = await supabase
          .from('pair_progress')
          .select('line_key')
          .eq('user_id', user.id)
          .eq('card_id', card.id);
        if (cancelled) return;
        mastered = new Set((data ?? []).map((row) => row.line_key));
      }
      if (cancelled) return;
      setMasteredKeys(mastered);
      setMasteryLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isAssociation, authLoading, user, card.id]);

  // Remet à zéro la file une fois qu'on change de carte.
  useEffect(() => {
    queueBuiltRef.current = false;
  }, [card.id]);

  const remainingCount = useMemo(
    () => allPairs.filter((p) => !masteredKeys.has(p.key)).length,
    [allPairs, masteredKeys],
  );
  const needsScopeChoice = masteryLoaded && remainingCount > 0 && remainingCount < allPairs.length;

  // Construit la file de révision une seule fois, une fois la mémorisation
  // connue et (si nécessaire) le choix de périmètre fait par l'utilisateur.
  useEffect(() => {
    if (!isAssociation || !masteryLoaded || queueBuiltRef.current) return;
    if (needsScopeChoice && scopeChoice === null) return;
    const scope: ReviewScope = needsScopeChoice ? scopeChoice! : 'failures';
    const remaining = scope === 'all' ? allPairs : allPairs.filter((p) => !masteredKeys.has(p.key));
    queueBuiltRef.current = true;
    setQueue(shuffle(remaining));
    if (remaining.length === 0) setFinished(true);
  }, [isAssociation, masteryLoaded, needsScopeChoice, scopeChoice, masteredKeys, allPairs]);

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
      if (newStatus === 'termine' && isAssociation) {
        await supabase.from('pair_progress').delete().eq('user_id', user.id).eq('card_id', card.id);
        setMasteredKeys(new Set());
      }
      setStatus(newStatus);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  async function restart() {
    if (isAssociation) {
      if (remainingCount === 0) {
        // Tout est déjà mémorisé : on oublie la progression pour tout reproposer.
        setResetting(true);
        if (user) {
          try {
            await supabase.from('pair_progress').delete().eq('user_id', user.id).eq('card_id', card.id);
          } catch {
            // On réinitialise localement même si la suppression réseau échoue.
          }
        }
        setResetting(false);
        setMasteredKeys(new Set());
      }
      setScopeChoice(null);
      queueBuiltRef.current = false;
      setQueue([]);
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

  // Moves the current pair to the "done" pile, marks it as mastered, and shows the next one.
  function finalizeAdvance() {
    setRevealed(false);
    setDragX(0);
    setIsAnimating(false);
    const [completed, ...rest] = queue;
    setDoneStack((d) => [...d, completed]);
    setQueue(rest);
    setMasteredKeys((prev) => new Set(prev).add(completed.key));
    if (user) {
      supabase
        .from('pair_progress')
        .upsert(
          { user_id: user.id, card_id: card.id, line_key: completed.key },
          { onConflict: 'user_id,card_id,line_key' },
        )
        .then(({ error }) => {
          if (error) setActionError(error.message);
        });
    }
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
    if (!revealed || isAnimating || (e.target as HTMLElement).closest('button')) return;
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

  if (isAssociation && allPairs.length === 0) return <p>Cette carte n'a pas encore de contenu à réviser.</p>;
  if (!isAssociation && recitationLines.length === 0) return <p>Cette carte n'a pas encore de contenu à réviser.</p>;
  if (isAssociation && !masteryLoaded) return <p>Chargement…</p>;

  if (isAssociation && needsScopeChoice && scopeChoice === null) {
    return (
      <div className="panel review-summary">
        <p>
          Cette carte a des lignes déjà mémorisées et d'autres qu'il reste à réviser.
        </p>
        <div className="review-actions">
          <button onClick={() => setScopeChoice('failures')}>Réviser uniquement ce qui reste</button>
          <button className="button-secondary" onClick={() => setScopeChoice('all')}>
            Tout réviser
          </button>
        </div>
      </div>
    );
  }

  // La file est construite par un effet séparé, une fois le périmètre connu :
  // le temps qu'il tourne, on affiche un état de chargement plutôt que de
  // rendre une file vide.
  if (isAssociation && !finished && queue.length === 0) return <p>Chargement…</p>;

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
          {isAssociation
            ? doneStack.length > 0
              ? `${doneStack.length} paires révisées.`
              : 'Toutes les paires de cette carte sont déjà mémorisées.'
            : `${recitationLines.length} phrases parcourues.`}
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
              <button className="button-secondary" disabled={saving || resetting} onClick={restart}>
                🔁 Relancer un cycle de révision
              </button>
            </div>
          )
        ) : (
          <div className="review-actions">
            <p className="hint">Connectez-vous pour enregistrer votre progression.</p>
            <button className="button-secondary" disabled={resetting} onClick={restart}>
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
          <p className="review-prompt">{current.prompt}</p>
          {revealed && <p className="review-answer">{current.answer}</p>}
          {!revealed ? (
            <button
              type="button"
              className="review-card-flip review-card-flip-hint"
              disabled={isAnimating}
              onClick={(e) => {
                e.stopPropagation();
                if (!isAnimating) setRevealed(true);
              }}
              aria-label="Révéler la réponse"
              title="Révéler la réponse"
            >
              <IconFlip />
            </button>
          ) : (
            <div className="review-card-judge">
              <button
                type="button"
                className="review-card-judge-btn review-card-judge-no"
                disabled={isAnimating}
                onClick={(e) => {
                  e.stopPropagation();
                  requeueCurrent();
                }}
                aria-label="Je ne savais pas — remettre dans la pile à réviser"
                title="Je ne savais pas — remettre dans la pile à réviser"
              >
                <IconThumbDown />
              </button>
              <button
                type="button"
                className="review-card-judge-btn review-card-judge-yes"
                disabled={isAnimating}
                onClick={(e) => {
                  e.stopPropagation();
                  completeCurrent();
                }}
                aria-label={isLastCard ? 'Je savais — terminer' : 'Je savais — carte suivante'}
                title={isLastCard ? 'Je savais — terminer' : 'Je savais — carte suivante'}
              >
                <IconThumbUp />
              </button>
            </div>
          )}
        </div>
      </div>
      {revealed && <p className="review-hint-swipe">Glissez la carte ou appuyez sur → pour continuer</p>}
    </div>
  );
}
