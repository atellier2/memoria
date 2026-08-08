import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Card, CardRevision, CardType, Difficulty, Visibility } from '../types';
import { useAuth } from '../context/AuthContext';

const isNew = (id: string | undefined) => !id || id === 'new';

export default function CardEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<CardType>('association');
  const [lang, setLang] = useState('fr');
  const [difficulty, setDifficulty] = useState<Difficulty>('moyen');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [content, setContent] = useState('');

  const [revisions, setRevisions] = useState<CardRevision[]>([]);
  const [loading, setLoading] = useState(!isNew(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew(id)) return;

    let cancelled = false;
    async function load() {
      try {
        const { data, error } = await supabase.from('cards').select('*').eq('id', id).single();
        if (cancelled) return;
        if (error) {
          setError(error.message);
          return;
        }
        const card = data as Card;
        setTitle(card.title);
        setType(card.type);
        setLang(card.lang);
        setDifficulty(card.difficulty);
        setVisibility(card.visibility);
        setContent(card.content);

        const { data: revs } = await supabase
          .from('card_revisions')
          .select('*')
          .eq('card_id', id)
          .order('edited_at', { ascending: false });
        if (!cancelled && revs) setRevisions(revs);
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    try {
      if (isNew(id)) {
        const { data, error } = await supabase
          .from('cards')
          .insert({ title, type, lang, difficulty, visibility, content, owner_id: user.id })
          .select('id')
          .single();
        if (error) {
          setError(error.message);
          return;
        }
        navigate(`/cards/${data.id}`);
      } else {
        const { error } = await supabase
          .from('cards')
          .update({ title, type, lang, difficulty, visibility, content })
          .eq('id', id);
        if (error) {
          setError(error.message);
          return;
        }
        navigate(`/cards/${id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  async function restoreRevision(revisionContent: string) {
    if (!id || isNew(id)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('cards').update({ content: revisionContent }).eq('id', id);
      if (error) {
        setError(error.message);
        return;
      }
      setContent(revisionContent);
      const { data: revs } = await supabase
        .from('card_revisions')
        .select('*')
        .eq('card_id', id)
        .order('edited_at', { ascending: false });
      if (revs) setRevisions(revs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Chargement…</p>;

  const canEdit = !!user;
  const placeholder =
    type === 'association'
      ? '13|Bouches-du-Rhône\n06|Alpes-Maritimes'
      : 'Maître Corbeau, sur un arbre perché,\nTenait en son bec un fromage.';

  return (
    <div>
      <form className="panel" onSubmit={handleSubmit}>
        <h2>{isNew(id) ? 'Nouvelle card' : 'Éditer la card'}</h2>

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
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as CardType)}
              disabled={!canEdit || !isNew(id)}
            >
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
          Contenu {type === 'association' ? '(indice|réponse par ligne)' : '(une phrase par ligne)'}
        </label>
        <textarea
          id="content"
          rows={12}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          disabled={!canEdit}
        />

        {!canEdit && <p className="hint">Connectez-vous pour créer ou éditer une card.</p>}
        {error && <p className="error">{error}</p>}

        {canEdit && (
          <button type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
      </form>

      {!isNew(id) && (
        <div className="panel">
          <Link to={`/cards/${id}/review`}>
            <button type="button">Réviser cette card</button>
          </Link>
        </div>
      )}

      {!isNew(id) && (
        <div className="panel">
          <h3>Historique</h3>
          {revisions.length === 0 && <p>Aucune modification archivée pour l'instant.</p>}
          <ul className="revision-list">
            {revisions.map((rev) => (
              <li key={rev.id}>
                <span>{new Date(rev.edited_at).toLocaleString('fr-FR')}</span>
                <button type="button" onClick={() => restoreRevision(rev.content)} disabled={!canEdit}>
                  Restaurer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
