import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { CardOutletContext } from './CardPage';
import { parseAssociation, parseRecitation, pairLineKey } from '../lib/parseContent';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function CardView() {
  const { card, hideMastered, setViewFilterAvailable } = useOutletContext<CardOutletContext>();
  const { user, loading: authLoading } = useAuth();
  const isAssociation = card.type === 'association';

  const pairs = useMemo(
    () => (isAssociation ? parseAssociation(card.content).map((p) => ({ ...p, key: pairLineKey(p) })) : []),
    [isAssociation, card.content],
  );
  const lines = useMemo(() => (isAssociation ? [] : parseRecitation(card.content)), [isAssociation, card.content]);

  const [masteredKeys, setMasteredKeys] = useState<Set<string>>(new Set());
  const [masteryLoaded, setMasteryLoaded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  async function toggleMastered(key: string) {
    if (!user) return;
    const wasMastered = masteredKeys.has(key);
    setMasteredKeys((prev) => {
      const next = new Set(prev);
      if (wasMastered) next.delete(key);
      else next.add(key);
      return next;
    });
    setActionError(null);
    const { error } = wasMastered
      ? await supabase.from('pair_progress').delete().eq('user_id', user.id).eq('card_id', card.id).eq('line_key', key)
      : await supabase
          .from('pair_progress')
          .upsert({ user_id: user.id, card_id: card.id, line_key: key }, { onConflict: 'user_id,card_id,line_key' });
    if (error) {
      setActionError(error.message);
      setMasteredKeys((prev) => {
        const next = new Set(prev);
        if (wasMastered) next.add(key);
        else next.delete(key);
        return next;
      });
    }
  }

  const masteredCount = pairs.filter((p) => masteredKeys.has(p.key)).length;
  const remainingCount = pairs.length - masteredCount;
  const showMasteryUi = user && isAssociation && masteryLoaded && pairs.length > 0;
  const visiblePairs = hideMastered ? pairs.filter((p) => !masteredKeys.has(p.key)) : pairs;

  // Le toggle vit dans le drawer de CardPage : on lui signale seulement s'il y
  // a quelque chose à masquer, et on le retire en quittant cet onglet.
  const filterAvailable = Boolean(showMasteryUi && masteredCount > 0);
  useEffect(() => {
    setViewFilterAvailable(filterAvailable);
    return () => setViewFilterAvailable(false);
  }, [filterAvailable, setViewFilterAvailable]);

  return (
    <div className="panel">
      <div className="card-meta">
        <span className={`badge badge-${card.type}`}>{isAssociation ? 'Association' : 'Récitation'}</span>
        <span className="badge">{card.lang}</span>
        <span className="badge">{card.visibility}</span>
        {showMasteryUi && (
          <>
            <span className="badge badge-mastered-count">{masteredCount} mémorisées</span>
            <span className="badge">{remainingCount} à réviser</span>
          </>
        )}
      </div>

      {isAssociation ? (
        pairs.length === 0 ? (
          <p className="hint">Cette carte n'a pas encore de contenu.</p>
        ) : (
          <table className="view-table">
            <tbody>
              {visiblePairs.map((pair) => {
                const mastered = masteredKeys.has(pair.key);
                const rowClass = [user ? 'view-table-row-clickable' : '', mastered ? 'view-table-row-mastered' : '']
                  .filter(Boolean)
                  .join(' ');
                return (
                  <tr key={pair.key} className={rowClass} onClick={user ? () => toggleMastered(pair.key) : undefined}>
                    <td>{pair.front}</td>
                    <td>{pair.back}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : lines.length === 0 ? (
        <p className="hint">Cette carte n'a pas encore de contenu.</p>
      ) : (
        <div className="view-text">
          {lines.map((line, i) => (
            <p key={i}>{line.text}</p>
          ))}
        </div>
      )}

      {actionError && <p className="error">{actionError}</p>}
    </div>
  );
}
