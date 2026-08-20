import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { CardRevision, Visibility } from '../types';
import { useAuth } from '../context/AuthContext';
import type { CardOutletContext } from './CardPage';

export default function CardEditForm() {
  const { card, setCard, onDeleteCard, deletingCard, canDelete } = useOutletContext<CardOutletContext>();
  const { user } = useAuth();

  const [title, setTitle] = useState(card.title);
  const [lang, setLang] = useState(card.lang);
  const [visibility, setVisibility] = useState<Visibility>(card.visibility);
  const [content, setContent] = useState(card.content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revisions, setRevisions] = useState<CardRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(true);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);

  const fetchRevisions = useCallback(
    () =>
      supabase.from('card_revisions').select('*').eq('card_id', card.id).order('edited_at', { ascending: false }),
    [card.id],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadRevisions() {
      setRevisionsLoading(true);
      setRevisionsError(null);
      const { data, error } = await fetchRevisions();
      if (cancelled) return;
      // Un historique illisible n'est pas un historique vide : on le dit,
      // sinon l'écran affirme qu'aucune modification n'a été archivée.
      if (error) setRevisionsError(error.message);
      else setRevisions(data ?? []);
      setRevisionsLoading(false);
    }
    loadRevisions();
    return () => {
      cancelled = true;
    };
  }, [fetchRevisions]);

  async function refreshRevisions() {
    const { data, error } = await fetchRevisions();
    if (error) setRevisionsError(error.message);
    else {
      setRevisionsError(null);
      setRevisions(data ?? []);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('cards')
        .update({ title, lang, visibility, content })
        .eq('id', card.id)
        .select('*')
        .single();
      if (error) {
        setError(error.message);
        return;
      }
      setCard(data);
      setSaved(true);
      await refreshRevisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  async function restoreRevision(revisionContent: string) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('cards')
        .update({ content: revisionContent })
        .eq('id', card.id)
        .select('*')
        .single();
      if (error) {
        setError(error.message);
        return;
      }
      setCard(data);
      setContent(revisionContent);
      await refreshRevisions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  const canEdit = !!user;
  const placeholder =
    card.type === 'association'
      ? '13|Bouches-du-Rhône\n06|Alpes-Maritimes'
      : 'Maître Corbeau, sur un arbre perché,\nTenait en son bec un fromage.';

  return (
    <div>
      <form className="panel" onSubmit={handleSubmit}>
        <label htmlFor="title">Titre</label>
        <input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canEdit}
        />

        <div className="field-row">
          <div>
            <label htmlFor="type">Type</label>
            <select id="type" value={card.type} disabled>
              <option value="association">Association</option>
              <option value="recitation">Récitation</option>
            </select>
          </div>
          <div>
            <label htmlFor="lang">Langue</label>
            <input id="lang" value={lang} onChange={(e) => setLang(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <label htmlFor="visibility">Visibilité</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              disabled={!canEdit}
            >
              <option value="public">Publique</option>
              <option value="unlisted">Non listée</option>
              <option value="private">Privée</option>
            </select>
          </div>
        </div>

        <label htmlFor="content">
          Contenu {card.type === 'association' ? '(indice|réponse par ligne)' : '(une phrase par ligne)'}
        </label>
        <textarea
          id="content"
          rows={12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          disabled={!canEdit}
        />

        {!canEdit && <p className="hint">Connectez-vous pour éditer cette carte.</p>}
        {error && <p className="error">{error}</p>}
        {saved && <p className="hint">Modifications enregistrées.</p>}

        {canEdit && (
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {canDelete && card.status !== 'deleted' && (
              <button
                type="button"
                className="icon-button-danger"
                onClick={onDeleteCard}
                disabled={deletingCard}
                aria-label="Supprimer la carte"
                title="Supprimer la carte"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </form>

      <div className="panel">
        <h3>Historique</h3>
        {revisionsLoading && <p>Chargement…</p>}
        {revisionsError && <p className="error">{revisionsError}</p>}
        {!revisionsLoading && !revisionsError && revisions.length === 0 && (
          <p>Aucune modification archivée pour l'instant.</p>
        )}
        <ul className="revision-list">
          {revisions.map((rev) => (
            <li key={rev.id}>
              <span>{new Date(rev.edited_at).toLocaleString('fr-FR')}</span>
              <button type="button" onClick={() => restoreRevision(rev.content)} disabled={!canEdit || saving}>
                Restaurer
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
