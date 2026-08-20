import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Card, CardStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import OptionsDrawer from '../components/OptionsDrawer';

export interface CardOutletContext {
  card: Card;
  setCard: (card: Card) => void;
  onDeleteCard: () => void;
  deletingCard: boolean;
  canDelete: boolean;
  // Les options d'affichage de CardView vivent dans le drawer de cette page :
  // CardView signale lesquelles s'appliquent et lit leur état, mais ne rend
  // plus son propre menu.
  hideMastered: boolean;
  setHideMastered: (value: boolean) => void;
  shuffleLines: boolean;
  setViewOptions: (options: ViewOptions) => void;
}

export interface ViewOptions {
  canHideMastered: boolean;
  canShuffle: boolean;
}

const NO_VIEW_OPTIONS: ViewOptions = { canHideMastered: false, canShuffle: false };

const STATUS_LABELS: Record<CardStatus, string> = {
  normal: 'Normale',
  signalee: 'Signalée',
  deleted: 'Supprimée',
};

export default function CardPage() {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const canModerate = role === 'manager' || role === 'admin';
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hideMastered, setHideMastered] = useState(false);
  const [shuffleLines, setShuffleLines] = useState(false);
  const [viewOptions, setViewOptions] = useState<ViewOptions>(NO_VIEW_OPTIONS);

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

  // Le mélange est ouvert aux visiteurs non connectés, la modération non : on
  // conditionne chaque action plutôt que la section entière.
  const canRestore = Boolean(user) && canModerate && card.status === 'deleted';
  const canReport = Boolean(user) && card.status !== 'signalee';
  const showActions = viewOptions.canShuffle || canRestore || canReport;

  return (
    <div>
      <h2>{card.title}</h2>
      {card.status !== 'normal' && (
        <div className="card-meta">
          <span className={`badge badge-cardstatus-${card.status}`}>{STATUS_LABELS[card.status]}</span>
        </div>
      )}
      <button
        type="button"
        className="options-trigger options-trigger-floating"
        onClick={() => setDrawerOpen(true)}
        aria-haspopup="dialog"
        aria-label="Options"
      >
        ⋮
      </button>
      <OptionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Options"
        navigation={
          <nav className="mode-tabs mode-tabs-vertical">
            <NavLink to={`/cards/${card.id}`} end onClick={() => setDrawerOpen(false)}>
              👁️ Visualiser
            </NavLink>
            {user && (
              <NavLink to={`/cards/${card.id}/edit`} onClick={() => setDrawerOpen(false)}>
                ✏️ Éditer
              </NavLink>
            )}
            <NavLink to={`/cards/${card.id}/review`} onClick={() => setDrawerOpen(false)}>
              🎯 Réviser
            </NavLink>
          </nav>
        }
        filters={
          viewOptions.canHideMastered ? (
            <button
              type="button"
              className={`filter-toggle${hideMastered ? ' active' : ''}`}
              aria-pressed={hideMastered}
              onClick={() => setHideMastered(!hideMastered)}
            >
              <span className="filter-toggle-check" aria-hidden="true" />
              Masquer les lignes déjà mémorisées
            </button>
          ) : undefined
        }
        actions={
          showActions ? (
            <>
              {viewOptions.canShuffle && (
                <button
                  type="button"
                  className={`filter-toggle filter-toggle-plain${shuffleLines ? ' active' : ''}`}
                  aria-pressed={shuffleLines}
                  onClick={() => setShuffleLines(!shuffleLines)}
                >
                  🔀 Mélanger les lignes
                </button>
              )}
              {canRestore && (
                <button type="button" onClick={() => changeStatus('normal')} disabled={statusSaving}>
                  ♻️ Restaurer
                </button>
              )}
              {canReport && (
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
            </>
          ) : undefined
        }
      />
      <Outlet
        context={
          {
            card,
            setCard,
            onDeleteCard: () => changeStatus('deleted'),
            deletingCard: statusSaving,
            canDelete: canModerate,
            hideMastered,
            setHideMastered,
            shuffleLines,
            setViewOptions,
          } satisfies CardOutletContext
        }
      />
    </div>
  );
}
