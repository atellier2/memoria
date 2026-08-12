import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { CardType, Visibility } from '../types';
import { useAuth } from '../context/AuthContext';

export default function CardCreate() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<CardType>('association');
  const [lang, setLang] = useState('fr');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('cards')
        .insert({ title, type, lang, visibility, content, owner_id: user.id })
        .select('id')
        .single();
      if (error) {
        setError(error.message);
        return;
      }
      navigate(`/cards/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau.');
    } finally {
      setSaving(false);
    }
  }

  const placeholder =
    type === 'association'
      ? '13|Bouches-du-Rhône\n06|Alpes-Maritimes'
      : 'Maître Corbeau, sur un arbre perché,\nTenait en son bec un fromage.';

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>Nouvelle carte</h2>

      <label htmlFor="title">Titre</label>
      <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} disabled={!user} />

      <div className="field-row">
        <div>
          <label htmlFor="type">Type</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value as CardType)} disabled={!user}>
            <option value="association">Association</option>
            <option value="recitation">Récitation</option>
          </select>
        </div>
        <div>
          <label htmlFor="lang">Langue</label>
          <input id="lang" value={lang} onChange={(e) => setLang(e.target.value)} disabled={!user} />
        </div>
        <div>
          <label htmlFor="visibility">Visibilité</label>
          <select
            id="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            disabled={!user}
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
        disabled={!user}
      />

      {!user && <p className="hint">Connectez-vous pour créer une carte.</p>}
      {error && <p className="error">{error}</p>}

      {user && (
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Créer la carte'}
        </button>
      )}
    </form>
  );
}
