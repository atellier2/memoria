import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Card, Progress } from '../types';
import { useAuth } from '../context/AuthContext';

export default function CardsList() {
  const { user } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [progressByCard, setProgressByCard] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <p>Chargement…</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <h2>Cartes</h2>
      {cards.length === 0 && <p>Aucune carte pour l'instant.</p>}
      <ul className="card-list">
        {cards.map((card) => {
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
                <span className={`badge badge-difficulty-${card.difficulty}`}>{card.difficulty}</span>
                {status && (
                  <span className={`badge badge-status-${status}`}>
                    {status === 'termine' ? 'Terminé' : 'En cours'}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
