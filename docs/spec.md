# Spécification — Carnet de mémoire collaboratif

Statut : brouillon v1 — à valider avant implémentation
Dernière mise à jour : 2026-08-08

---

## 1. Vue d'ensemble

Application web permettant de créer et réviser des cartes de deux natures :

- **Association** — un indice (ex. un code) à associer à une réponse, révisé dans le désordre.
- **Récitation** — un texte long révisé phrase par phrase, dans l'ordre.

Le système est collaboratif : plusieurs utilisateurs peuvent co-éditer un même deck. La progression d'apprentissage reste strictement individuelle.

Backend : **Supabase** (Postgres + Auth + Row Level Security + API auto-générée).

---

## 2. Décisions produit actées

| Sujet | Décision |
|---|---|
| Unification des types de cartes | Une seule entité `card` — plus de distinction structurelle deck/carte, tout vit dans une seule table |
| Front/back | Non séparés en colonnes — stockés dans un seul champ **texte brut**, interprété à la volée (plus de JSON) |
| Format de saisie | Syntaxe markdown-pipe : `indice\|réponse` par ligne pour l'association ; une phrase par ligne, sans pipe, pour la récitation |
| Sous-unité (paire/ligne) | Pas d'`id` stocké — identifiée par le hash de son propre texte au moment de la lecture (voir §3.3) |
| `order` explicite | Absent — l'ordre est la position de la ligne dans le texte |
| Statut d'apprentissage | Propriété de l'utilisateur, au niveau de la `card` entière — pas de granularité par ligne |
| Collaboration | Édition ouverte à tout utilisateur authentifié — pas de liste de collaborateurs, pas d'invitation |
| Échelle de la communauté | Ouverte, taille inconnue |
| Gestion des conflits d'édition | Dernier écrit gagne, au niveau de la `card` entière — **risque accepté**, voir §7 |
| Backend | Supabase (Postgres, Auth, RLS) |

---

## 3. Modèle de données

### 3.1 Principe

- Une seule table, **`cards`**. Ce que la v1 de cette spec appelait `deck` — le titre, le type, la langue, la difficulté, et le contenu entier — vit maintenant dans une seule ligne de cette table.
- Le **contenu** est un champ **texte brut**, jamais du JSON. Le texte est interprété (parsé) à la volée à chaque lecture, côté client, avec la syntaxe pipe/ligne définie en §3.3.
- Il n'y a pas d'`id` stocké pour chaque paire/ligne à l'intérieur du texte, et pas de statut par ligne non plus. Le statut d'apprentissage s'applique à la **card entière** : "en cours" ou "terminé" porte sur l'ensemble du contenu, pas sur une paire/ligne précise.
- La **progression** reste une table séparée, une ligne par (utilisateur, card), jamais mutable par personne d'autre que son propriétaire.
- Édition ouverte : n'importe quel utilisateur authentifié peut modifier n'importe quelle `card`. Pas de notion de collaborateurs.

### 3.2 Schéma SQL

```sql
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
create table cards (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  type          text not null check (type in ('association', 'recitation')),
  lang          text not null default 'fr',       -- ISO 639-1
  difficulty    text not null default 'moyen'      check (difficulty in ('facile', 'moyen', 'difficile')),
  content       text not null default '',          -- texte brut, voir §3.3 pour la syntaxe
  visibility    text not null default 'public'     check (visibility in ('public', 'unlisted', 'private')),
  owner_id      uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);

-- ---------------------------------------------------------------
-- Progression individuelle — jamais partagée entre utilisateurs.
-- Statut au niveau de la card entière, pas de granularité par ligne.
create table progress (
  user_id           uuid not null references auth.users(id) on delete cascade,
  card_id           uuid not null references cards(id) on delete cascade,
  status            text not null default 'en_cours' check (status in ('en_cours', 'termine')),
  last_reviewed_at  timestamptz,
  review_count      integer not null default 0,
  primary key (user_id, card_id)
);

-- ---------------------------------------------------------------
-- Historique de versions du texte — filet de sécurité anti-vandalisme,
-- indispensable puisque l'édition est ouverte à tous sans validation préalable (voir §7)
create table card_revisions (
  id            bigint generated always as identity primary key,
  card_id       uuid not null references cards(id) on delete cascade,
  content       text not null,
  edited_by     uuid references auth.users(id),
  edited_at     timestamptz not null default now()
);
```

### 3.3 Syntaxe du champ `content` (texte brut)

**`type = 'association'`**

```
13|Bouches-du-Rhône
06|Alpes-Maritimes
```
Règle de parsing : chaque ligne non vide contenant un `|` produit une paire `{front, back}`. Tout ce qui précède le premier `|` est `front`, tout ce qui suit est `back`.

**`type = 'recitation'`**

```
Maître Corbeau, sur un arbre perché,
Tenait en son bec un fromage.
```
Règle de parsing : chaque ligne non vide sans `|` produit un item `{text}`, dans l'ordre d'apparition — cet ordre porte l'information de séquence, il n'y a rien d'autre à stocker pour ça.

**Ordre** (pour `recitation` uniquement) : la position de la ligne dans le texte porte l'information de séquence — rien de plus à stocker pour ça.

- `lang` et `difficulty` restent portés par la `card` entière (toutes les lignes qu'elle contient partagent la même langue/difficulté) — hypothèse non re-questionnée depuis §8 v1, à confirmer.

---

## 4. Authentification & permissions (RLS)

- Auth via Supabase Auth (email magic link a minima).
- `cards.visibility = 'public'` → lecture libre par tout le monde (y compris non connecté).
- Édition du `content` → ouverte à **tout utilisateur authentifié**, quel que soit le propriétaire. Pas de liste de collaborateurs à gérer.
- `progress` → RLS stricte : un utilisateur ne peut lire/écrire que ses propres lignes (`user_id = auth.uid()`).

### 4.1 Policies indicatives

```sql
alter table cards enable row level security;
alter table progress enable row level security;
alter table card_revisions enable row level security;

-- Lecture publique des cards publiques
create policy "cards_read_public" on cards
  for select using (visibility = 'public' or owner_id = auth.uid());

-- Édition ouverte à tout utilisateur authentifié
create policy "cards_update_open" on cards
  for update using (auth.uid() is not null);

-- Création : tout utilisateur authentifié devient owner_id de sa propre card
create policy "cards_insert_authenticated" on cards
  for insert with check (auth.uid() = owner_id);

-- Progression strictement individuelle
create policy "progress_owner_only" on progress
  for all using (user_id = auth.uid());

-- Historique lisible par tous, écrit uniquement via trigger (voir §5)
create policy "revisions_read_public" on card_revisions
  for select using (true);
```

---

## 5. Flux utilisateurs principaux

1. **Créer une card** : titre, type, langue, difficulté → contenu texte vide.
2. **Éditer le contenu** : zone de texte brut (syntaxe pipe/ligne) → écriture de `content` complet en une seule requête `update`, ouverte à tout utilisateur authentifié. Un trigger côté DB archive l'ancienne valeur dans `card_revisions` avant chaque `update` (voir §4.1 — insertion automatique, pas de policy d'écriture manuelle nécessaire).
3. **Réviser (association)** : parsing du `content` à la lecture → toutes les paires de la card sont mises en jeu à chaque session (le statut, étant global à la card, ne filtre pas les paires individuelles). En fin de session, l'utilisateur marque la card entière `termine` ou `en_cours`.
4. **Réciter (récitation)** : parsing du `content` à la lecture → parcours séquentiel complet des lignes dans l'ordre du texte, du début à la fin. En fin de parcours, l'utilisateur marque la card entière `termine` ou `en_cours`.
5. **Consulter l'historique d'une card** : lecture de `card_revisions`, restauration possible d'une version antérieure par n'importe quel utilisateur authentifié (cohérent avec l'édition ouverte — pas de restriction au seul propriétaire).

---

## 6. Stack technique proposée

- Frontend : React (SPA), client `@supabase/supabase-js`.
- Backend : Supabase (Postgres 15+, Auth, RLS, API REST auto-générée via PostgREST).
- Pas de couche serveur custom nécessaire pour la V1 — toute la logique métier passe par des policies RLS + requêtes côté client.

---

## 7. Risques connus et limites acceptées (V1)

- **Écrasement en cas d'édition simultanée de la même card** : une écriture remplace l'intégralité du `content`. Deux contributeurs modifiant la même card en parallèle → le second écrase le premier. Mitigation partielle : `card_revisions` permet un rollback manuel, mais ne prévient pas la perte initiale. À surveiller si l'usage réel montre des collisions fréquentes.
- **Édition totalement ouverte, sans validation préalable** : conséquence directe de l'abandon de `deck_collaborators` — n'importe quel utilisateur authentifié peut modifier n'importe quelle card, y compris celles qu'il n'a pas créées. C'est un choix assumé (modèle wiki), mais ça expose à du vandalisme ou des modifications de mauvaise foi dès le premier jour. `card_revisions` est le seul garde-fou (rollback a posteriori, jamais de blocage a priori).
- **Pas de filtrage par item lors d'une session de révision** : le statut étant global à la card, une session de révision remet systématiquement en jeu la totalité des paires — y compris celles que l'utilisateur maîtrise déjà. Sur une card à 100 paires, ça veut dire réviser les 100 à chaque fois, sans notion de "ce qu'il me reste à apprendre". Accepté comme conséquence directe du refus de statut par ligne.
- **Pas de co-édition temps réel** : deux personnes ouvrant le même éditeur au même moment ne se voient pas mutuellement. Hors périmètre V1.
- **Modération** : aucun mécanisme de signalement ou de blocage d'utilisateur en V1 malgré l'édition ouverte à tous. À considérer avant une mise en production publique.

---

## 8. Questions ouvertes — à trancher avant implémentation

1. **Portée de `lang` et `difficulty`** : au niveau de la `card` entière (hypothèse actuelle du schéma) ou par ligne/paire individuelle (nécessiterait de les glisser dans le format pipe, ex. `13|Bouches-du-Rhône|fr|facile`) ?
2. **Granularité du statut** : confirmé au niveau card entière suite à la dernière décision — si une liste de 100 paires doit un jour permettre de cibler ce qui reste à apprendre, il faudra revenir sur ce point (fractionner la card en plusieurs cards plus petites est le contournement le plus simple avec le modèle actuel, plutôt que réintroduire un statut par ligne).
3. **Trigger d'archivage** : `card_revisions` s'alimente via un trigger Postgres `before update on cards` (à écrire) plutôt que par une écriture explicite côté client, pour garantir qu'aucune édition n'échappe à l'historique.

---

## 9. Hors périmètre V1 (explicitement exclu)

- Co-édition temps réel (CRDT / WebSockets).
- Répétition espacée algorithmique (type SM-2/FSRS) — le statut reste binaire `en_cours` / `termine`, géré manuellement par l'utilisateur.
- Classements ou comparaison sociale des scores entre utilisateurs.
- Export/import multi-format (CSV, Anki `.apkg`, etc.).
