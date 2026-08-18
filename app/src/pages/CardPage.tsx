import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Card, CardStatus } from '../types';
import { useAuth } from '../context/AuthContext';

export interface CardOutletContext {
  card: Card;
  setCard: (card: Card) => void;
  onDeleteCard: () => void;
  deletingCard: boolean;
}

const STATUS_LABELS: Record<CardStatus, string> = {
  normal: 'Normale',
  signalee: 'Signalée',
  deleted: 'Supprimée',
};

export default function CardPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.from('cards').select('*').eq('id', id).single();
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        setCard(data as Card);
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

  async function changeStatus(status: CardStatus) {
    if (!card) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const { data, error } = await supabase
        .from('cards')
        .update({ status })
        .eq('id', card.id)
        .select('*')
        .single();
      if (error) {
        setStatusError(error.message);
        return;
      }
      setCard(data as Card);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setStatusSaving(false);
    }
  }

  if (loading) return <p>Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!card) return <p>Carte introuvable.</p>;

  return (
    <div>
      <h2>{card.title}</h2>
      {card.status !== 'normal' && (
        <div className="card-meta">
          <span className={`badge badge-cardstatus-${card.status}`}>{STATUS_LABELS[card.status]}</span>
        </div>
      )}
      <nav className="mode-tabs">
        <NavLink to={`/cards/${card.id}`} end>
          👁️ Visualiser
        </NavLink>
        {user && <NavLink to={`/cards/${card.id}/edit`}>✏️ Éditer</NavLink>}
        <NavLink to={`/cards/${card.id}/review`}>🎯 Réviser</NavLink>
      </nav>
      {user && (
        <div className="status-actions">
          {card.status === 'deleted' && (
            <button type="button" onClick={() => changeStatus('normal')} disabled={statusSaving}>
              ♻️ Restaurer
            </button>
          )}
          {card.status !== 'signalee' && (
            <button
              type="button"
              className="status-action-subtle"
              onClick={() => changeStatus('signalee')}
              disabled={statusSaving}
            >
              🚩 Signaler
            </button>
          )}
          {statusError && <p className="error">{statusError}</p>}
        </div>
      )}
      <Outlet
        context={
          {
            card,
            setCard,
            onDeleteCard: () => changeStatus('deleted'),
            deletingCard: statusSaving,
          } satisfies CardOutletContext
        }
      />
    </div>
  );
}
