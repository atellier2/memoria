# memoria

Carnet de mémoire collaboratif — cartes d'association et de récitation, backend Supabase.

Voir [`docs/spec.md`](docs/spec.md) pour la spécification complète.

## Structure

- `app/` — frontend React (Vite + TypeScript), client `@supabase/supabase-js`.
- `supabase/migrations/` — schéma SQL (tables `cards`, `progress`, `card_revisions`, RLS, trigger d'archivage).

## Mise en route

### 1. Base de données

Dans l'éditeur SQL de votre projet Supabase, exécutez le contenu de
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

### 2. Frontend

```bash
cd app
cp .env.example .env   # renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

`VITE_SUPABASE_ANON_KEY` accepte la clé publique (`sb_publishable_...`) ou l'ancienne clé anon JWT — visible dans Project Settings → API du dashboard Supabase.

### Build de production

```bash
cd app
npm run build
```

## Fonctionnalités implémentées (V1)

- Authentification par lien magique (email).
- Création et édition ouverte des cards (titre, type, langue, difficulté, visibilité, contenu texte brut).
- Parsing du contenu selon la syntaxe pipe/ligne (`docs/spec.md` §3.3).
- Historique des révisions avec restauration.
- Session de révision association (paires dans le désordre) et récitation (phrases dans l'ordre), avec marquage de statut `en_cours` / `termine` par utilisateur.
