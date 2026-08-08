import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Card, ProgressStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { parseAssociation, parseRecitation, shuffle } from '../lib/parseContent';

export default function ReviewSession() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data, error } = await supabase.from('cards').select('*').eq('id', id).single();
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else {
          setCard(data as Card);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur réseau.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const items = useMemo(() => {
    if (!card) return [];
    if (card.type === 'association') {
      return shuffle(parseAssociation(card.content)).map((p) => ({ prompt: p.front, answer: p.back }));
    }
    return parseRecitation(card.content).map((l) => ({ prompt: l.text, answer: l.text }));
  }, [card]);

  async function markStatus(status: ProgressStatus) {
    if (!user || !card) return;
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

  if (loading) return <p>Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!card) return <p>Card introuvable.</p>;
  if (items.length === 0) return <p>Cette card n'a pas encore de contenu à réviser.</p>;

  if (finished) {
    return (
      <div className="panel">
        <h2>Session terminée</h2>
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
        <Link to={`/cards/${card.id}`}>Retour à la card</Link>
      </div>
    );
  }

  const current = items[index];

  return (
    <div className="panel">
      <h2>{card.title}</h2>
      <p className="hint">
        {index + 1} / {items.length}
      </p>
      <div className="review-card">
        <p className="review-prompt">{current.prompt}</p>
        {revealed && card.type === 'association' && <p className="review-answer">{current.answer}</p>}
      </div>
      {card.type === 'association' && !revealed ? (
        <button onClick={() => setRevealed(true)}>Révéler</button>
      ) : (
        <button onClick={next}>{index + 1 >= items.length ? 'Terminer' : 'Suivant'}</button>
      )}
    </div>
  );
}
