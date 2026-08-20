# memoria

Carnet de mémoire collaboratif — cartes d'**association** (indice → réponse, révisées dans le
désordre) et de **récitation** (texte révisé phrase par phrase, dans l'ordre). Frontend React,
backend Supabase : toute la logique métier vit dans la base (policies RLS, triggers, fonctions).

Spécification complète : [`docs/spec.md`](docs/spec.md).

## Structure

| Chemin | Rôle |
|---|---|
| `app/` | Frontend React (Vite + TypeScript), client `@supabase/supabase-js`, PWA |
| `supabase/migrations/` | Schéma SQL, RLS, triggers et fonctions — à appliquer dans l'ordre |
| `docs/spec.md` | Spécification produit et technique |
| `.github/workflows/deploy.yml` | Build et déploiement sur GitHub Pages |

## Mise en route

### 1. Base de données

Dans l'éditeur SQL du projet Supabase, exécutez les migrations **dans l'ordre de leur numéro** :

| Migration | Contenu |
|---|---|
| `0001_init.sql` | Tables `cards`, `progress`, `card_revisions`, RLS de base, trigger d'archivage |
| `0002_card_status_and_password_auth.sql` | `user_roles`, rôle `membre` par défaut, statut de modération des cartes |
| `0003_drop_difficulty.sql` | Retrait de la colonne `difficulty` |
| `0004_backfill_user_roles.sql` | Rôle `membre` pour les comptes créés avant `0002` |
| `0005_pair_progress.sql` | Mémorisation ligne à ligne (`pair_progress`) |
| `0006_progress_rules.sql` | Règles de progression R1–R4 (triggers + `record_review`) |
| `0007_fix_roles_moderation_and_visibility.sql` | Corrections C1–C7 (voir `docs/spec.md` §10) |

Les migrations ne sont pas idempotentes : elles s'appliquent une fois chacune, dans l'ordre.
`0001` à `0007` sont appliquées sur le projet Supabase `memoria`.

### 2. Frontend

```bash
cd app
cp .env.example .env   # renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

`VITE_SUPABASE_ANON_KEY` accepte la clé publique (`sb_publishable_...`) ou l'ancienne clé anon JWT
— visibles dans Project Settings → API du dashboard Supabase. Cette clé est destinée au client :
elle est incluse telle quelle dans le bundle, et c'est la RLS qui protège les données. Ne mettez
jamais la clé `service_role` dans un fichier `.env` du frontend.

### 3. Rôles

Les rôles ne se gèrent **jamais** depuis l'application. Tout compte créé démarre en `membre` ;
l'élévation se fait en SQL :

```sql
update public.user_roles set role = 'manager' where user_id = '<uuid>';
```

## Commandes

```bash
npm run dev       # serveur de développement
npm run build     # typecheck (tsc -b) puis build de production dans app/dist
npm run preview   # sert le build de production
npm run lint      # oxlint
```

## Déploiement

`.github/workflows/deploy.yml` construit `app/` et publie `app/dist` sur GitHub Pages à chaque
push sur `main` touchant `app/**`.

- `vite.config.ts` fixe `base: '/memoria/'` : l'application est servie sous ce chemin, et le
  routeur utilise ce même `basename`.
- Le workflow copie `index.html` en `404.html` : c'est ce qui permet aux URL profondes
  (`/memoria/cards/<id>`) de fonctionner sur GitHub Pages.
- Le build lit `app/.env`, versionné pour que la CI dispose de l'URL et de la clé publique du
  projet Supabase. Un fork qui vise un autre projet Supabase doit remplacer ce fichier.

## Fonctionnalités

- **Authentification** : email + mot de passe, ou lien magique (`Login.tsx`).
- **Cartes** : création, édition ouverte à tout utilisateur authentifié (modèle wiki), contenu en
  texte brut interprété à la volée (syntaxe pipe/ligne, `docs/spec.md` §3.3).
- **Historique** : chaque écriture de `content` archive la version précédente ; restauration
  possible depuis l'onglet Éditer.
- **Visualiser** : lecture de la carte ; pour une carte d'association, un clic sur une ligne la
  marque comme mémorisée, avec compteurs « mémorisées / à réviser », masquage des lignes acquises
  et mélange de l'ordre d'affichage.
- **Réviser** : session en cartes à retourner pour l'association (glisser/déposer ou pouces,
  choix du périmètre quand une partie est déjà mémorisée), parcours séquentiel pour la récitation.
  En fin de session, la carte se marque « en cours » ou « terminé ».
- **Modération** : signalement par tout membre, suppression douce et restauration par
  manager/admin, contrôlées par un trigger en base.
- **PWA** : installable, mise à jour automatique vérifiée au démarrage puis toutes les heures.
