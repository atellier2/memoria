import { useEffect, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { CardRevision, Difficulty, Visibility } from '../types';
import { useAuth } from '../context/AuthContext';
import type { CardOutletContext } from './CardPage';

export default function CardEditForm() {
  const { card, setCard } = useOutletContext<CardOutletContext>();
  const { user } = useAuth();

  const [title, setTitle] = useState(card.title);
  const [lang, setLang] = useState(card.lang);
  const [difficulty, setDifficulty] = useState<Difficulty>(card.difficulty);
  const [visibility, setVisibility] = useState<Visibility>(card.visibility);
  const [content, setContent] = useState(card.content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [revisions, setRevisions] = useState<CardRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadRevisions() {
      setRevisionsLoading(true);
      try {
        const { data } = await supabase
          .from('card_revisions')
          .select('*')
          .eq('card_id', card.id)
          .order('edited_at', { ascending: false });
        if (!cancelled && data) setRevisions(data);
      } finally {
        if (!cancelled) setRevisionsLoading(false);
      }
    }
    loadRevisions();
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  async function refreshRevisions() {
    const { data } = await supabase
      .from('card_revisions')
      .select('*')
      .eq('card_id', card.id)
      .order('edited_at', { ascending: false });
    if (data) setRevisions(data);
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
        .update({ title, lang, difficulty, visibility, content })
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
            <label htmlFor="difficulty">Difficulté</label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              disabled={!canEdit}
            >
              <option value="facile">Facile</option>
              <option value="moyen">Moyen</option>
              <option value="difficile">Difficile</option>
            </select>
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
          <button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
      </form>

      <div className="panel">
        <h3>Historique</h3>
        {revisionsLoading && <p>Chargement…</p>}
        {!revisionsLoading && revisions.length === 0 && <p>Aucune modification archivée pour l'instant.</p>}
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
