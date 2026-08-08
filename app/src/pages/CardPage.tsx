import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Card } from '../types';

export interface CardOutletContext {
  card: Card;
  setCard: (card: Card) => void;
}

export default function CardPage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <p>Chargement…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!card) return <p>Carte introuvable.</p>;

  return (
    <div>
      <h2>{card.title}</h2>
      <nav className="mode-tabs">
        <NavLink to={`/cards/${card.id}`} end>
          Visualiser
        </NavLink>
        <NavLink to={`/cards/${card.id}/edit`}>Éditer</NavLink>
        <NavLink to={`/cards/${card.id}/review`}>Réviser</NavLink>
      </nav>
      <Outlet context={{ card, setCard } satisfies CardOutletContext} />
    </div>
  );
}
