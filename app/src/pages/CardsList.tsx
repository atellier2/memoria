import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Card, CardType, Progress } from '../types';
import { useAuth } from '../context/AuthContext';
import OptionsDrawer from '../components/OptionsDrawer';

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      // La progression appartient à l'utilisateur courant : on repart d'une
      // table vide, sinon une déconnexion laisserait les badges "en cours" /
      // "terminé" du compte précédent sur la liste.
      setProgressByCard({});
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
    // Une carte "non listée" est lisible par lien direct mais n'apparaît pas
    // dans la liste — sauf pour son propriétaire, qui doit pouvoir la
    // retrouver.
    let result = cards.filter((card) => card.visibility !== 'unlisted' || card.owner_id === user?.id);
    if (typeFilter !== 'all') result = result.filter((card) => card.type === typeFilter);
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
      <button
        type="button"
        className="options-trigger options-trigger-floating"
        onClick={() => setDrawerOpen(true)}
        aria-haspopup="dialog"
        aria-label="Filtres"
      >
        ⋮
      </button>
      <OptionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filtres"
        filters={
          <>
            <div className="mode-tabs mode-tabs-vertical" role="group" aria-label="Filtrer par type">
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
              <>
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
              </>
            )}
          </>
        }
      />
      {filteredCards.length === 0 && (
        <p>
          {cards.length === 0
            ? "Aucune carte pour l'instant."
            : onlyInProgress && user
              ? 'Aucune carte en cours pour ce filtre.'
              : 'Aucune carte ne correspond à ces filtres.'}
        </p>
      )}
      <ul className="card-list">
        {filteredCards.map((card) => {
          const status = user ? progressByCard[card.id]?.status : undefined;
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
