import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Card, CardType, Progress } from '../types';
import { useAuth } from '../context/AuthContext';

type TypeFilter = 'all' | CardType;

export default function CardsList() {
  const { user } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [progressByCard, setProgressByCard] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [onlyInProgress, setOnlyInProgress] = useState(false);
  const [hideDeleted, setHideDeleted] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from('cards')
          .select('*')
          .order('updated_at', { ascending: false });

        if (cancelled) return;

        if (error) {
          setError(error.message);
          return;
        }

        setCards(data ?? []);

        if (user && data && data.length > 0) {
          const { data: progressRows } = await supabase
            .from('progress')
            .select('*')
            .eq('user_id', user.id)
            .in(
              'card_id',
              data.map((c) => c.id),
            );
          if (!cancelled && progressRows) {
            const map: Record<string, Progress> = {};
            for (const p of progressRows) map[p.card_id] = p;
            setProgressByCard(map);
          }
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
  }, [user]);

  const filteredCards = useMemo(() => {
    let result = typeFilter === 'all' ? cards : cards.filter((card) => card.type === typeFilter);
    if (user && onlyInProgress) {
      result = result.filter((card) => progressByCard[card.id]?.status === 'en_cours');
    }
    if (user && hideDeleted) {
      result = result.filter((card) => card.status !== 'deleted');
    }
    return result;
  }, [cards, typeFilter, user, onlyInProgress, hideDeleted, progressByCard]);

  if (loading) return <p>Chargement…</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <h2>Cartes</h2>
      <div className="mode-tabs" role="group" aria-label="Filtrer par type">
        <button
          type="button"
          className={typeFilter === 'all' ? 'active' : ''}
          onClick={() => setTypeFilter('all')}
        >
          Toutes
        </button>
        <button
          type="button"
          className={typeFilter === 'association' ? 'active' : ''}
          onClick={() => setTypeFilter('association')}
        >
          Association
        </button>
        <button
          type="button"
          className={typeFilter === 'recitation' ? 'active' : ''}
          onClick={() => setTypeFilter('recitation')}
        >
          Récitation
        </button>
      </div>
      {user && (
        <div className="filter-toggle-group">
          <button
            type="button"
            className={`filter-toggle${onlyInProgress ? ' active' : ''}`}
            aria-pressed={onlyInProgress}
            onClick={() => setOnlyInProgress((v) => !v)}
          >
            <span className="filter-toggle-check" aria-hidden="true" />
            Cartes en cours d'étude uniquement
          </button>
          <button
            type="button"
            className={`filter-toggle${hideDeleted ? ' active' : ''}`}
            aria-pressed={hideDeleted}
            onClick={() => setHideDeleted((v) => !v)}
          >
            <span className="filter-toggle-check" aria-hidden="true" />
            Cartes supprimées masquées
          </button>
        </div>
      )}
      {filteredCards.length === 0 && (
        <p>
          {cards.length === 0
            ? "Aucune carte pour l'instant."
            : onlyInProgress && user
              ? 'Aucune carte en cours pour ce filtre.'
              : 'Aucune carte de ce type.'}
        </p>
      )}
      <ul className="card-list">
        {filteredCards.map((card) => {
          const status = progressByCard[card.id]?.status;
          return (
            <li key={card.id} className="card-list-item">
              <Link to={`/cards/${card.id}`}>
                <strong>{card.title}</strong>
              </Link>
              <div className="card-meta">
                <span className={`badge badge-${card.type}`}>
                  {card.type === 'association' ? 'Association' : 'Récitation'}
                </span>
                <span className="badge">{card.lang}</span>
                {status && (
                  <span className={`badge badge-status-${status}`}>
                    {status === 'termine' ? 'Terminé' : 'En cours'}
                  </span>
                )}
                {card.status === 'signalee' && (
                  <span className="badge badge-cardstatus-signalee">Signalée</span>
                )}
                {card.status === 'deleted' && (
                  <span className="badge badge-cardstatus-deleted">Supprimée</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
