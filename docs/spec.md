# Spécification — Carnet de mémoire collaboratif

Statut : v2 — décrit l'application telle qu'elle est implémentée
Dernière mise à jour : 2026-08-20

---

## 1. Vue d'ensemble

Application web permettant de créer et réviser des cartes de deux natures :

- **Association** — un indice (ex. un code) à associer à une réponse, révisé dans le désordre.
- **Récitation** — un texte long révisé phrase par phrase, dans l'ordre.

Le système est collaboratif : plusieurs utilisateurs peuvent co-éditer une même carte. La
progression d'apprentissage reste strictement individuelle.

Backend : **Supabase** (Postgres + Auth + Row Level Security + API auto-générée par PostgREST).
Il n'y a pas de couche serveur applicative : **toute règle de gestion vit en base**, sous forme de
policies, de triggers ou de fonctions. Le client exprime une intention et relaie l'erreur que la
base renvoie s'il n'en a pas le droit.

---

## 2. Décisions produit actées

| Sujet | Décision |
|---|---|
| Unification des types de cartes | Une seule entité `card` — pas de distinction structurelle deck/carte |
| Front/back | Non séparés en colonnes — un seul champ **texte brut**, interprété à la volée |
| Format de saisie | Syntaxe markdown-pipe : `indice\|réponse` par ligne pour l'association ; une phrase par ligne, sans pipe, pour la récitation |
| Sous-unité (paire/ligne) | Pas d'`id` stocké — une paire est identifiée par son propre texte (`front\|back`), voir §3.4 |
| `order` explicite | Absent — l'ordre est la position de la ligne dans le texte |
| Statut d'apprentissage | Propriété de l'utilisateur, au niveau de la carte entière (`progress`) |
| Mémorisation ligne à ligne | **Uniquement pour l'association** (`pair_progress`) : une ligne est mémorisée ou reste à réviser (§3.4) |
| Collaboration | Édition ouverte à tout utilisateur authentifié — pas de liste de collaborateurs |
| Gestion des conflits d'édition | Dernier écrit gagne, au niveau de la carte entière — **risque accepté**, voir §8 |
| Backend | Supabase (Postgres, Auth, RLS) |
| Modération / suppression | Suppression douce par statut (`normal` / `signalee` / `deleted`) plutôt qu'un `delete` SQL — voir §4.3 |
| Rôles utilisateur | Trois rôles (`membre`, `manager`, `admin`), stockés dans `user_roles`, gérés uniquement en base — jamais via l'application front |
| Authentification | Email + mot de passe **et** lien magique, au choix de l'utilisateur |
| Visibilité | `public` (listée et lisible), `unlisted` (lisible par lien direct, absente de la liste), `private` (propriétaire seulement) |

> **Évolution depuis la v1** : la v1 excluait explicitement tout suivi par ligne, et acceptait
> qu'une session de révision remette systématiquement en jeu la totalité des paires. Les
> migrations `0005` et `0006` sont revenues sur ce point pour les cartes d'association
> uniquement — c'est la principale différence entre cette spécification et la précédente.

---

## 3. Modèle de données

### 3.1 Principes

- Le **contenu** d'une carte est un champ texte brut, jamais du JSON, interprété côté client à
  chaque lecture avec la syntaxe pipe/ligne définie en §3.3.
- La **progression** est une table séparée, une ligne par (utilisateur, carte), jamais mutable par
  quelqu'un d'autre que son propriétaire.
- La **mémorisation ligne à ligne** est une seconde table, une ligne par (utilisateur, carte,
  clé de ligne) : sa présence signifie « mémorisée », son absence « à réviser ».
- Édition ouverte : n'importe quel utilisateur authentifié peut modifier n'importe quelle carte.
  Seules son identité (`id`, `owner_id`, `created_at`) et ses transitions de statut sont
  contraintes.

### 3.2 Schéma

```sql
create table cards (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  type          text not null check (type in ('association', 'recitation')),
  lang          text not null default 'fr',       -- ISO 639-1
  content       text not null default '',         -- texte brut, voir §3.3
  visibility    text not null default 'public'    check (visibility in ('public', 'unlisted', 'private')),
  status        text not null default 'normal'    check (status in ('normal', 'signalee', 'deleted')),
  owner_id      uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);

-- Rôles utilisateur — gérés exclusivement en base, jamais depuis le front.
create table user_roles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'membre' check (role in ('membre', 'manager', 'admin')),
  created_at  timestamptz not null default now()
);

-- Progression individuelle, au niveau de la carte entière.
create table progress (
  user_id           uuid not null references auth.users(id) on delete cascade,
  card_id           uuid not null references cards(id) on delete cascade,
  status            text not null default 'en_cours' check (status in ('en_cours', 'termine')),
  last_reviewed_at  timestamptz,   -- écrit par record_review uniquement (R4)
  review_count      integer not null default 0,
  primary key (user_id, card_id)
);

-- Mémorisation ligne à ligne (cartes d'association).
create table pair_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  card_id      uuid not null references cards(id) on delete cascade,
  line_key     text not null,                     -- 'front|back', voir §3.4
  mastered_at  timestamptz not null default now(),
  primary key (user_id, card_id, line_key)
);

-- Historique de versions du texte — filet anti-vandalisme (§8).
create table card_revisions (
  id            bigint generated always as identity primary key,
  card_id       uuid not null references cards(id) on delete cascade,
  content       text not null,
  edited_by     uuid references auth.users(id),
  edited_at     timestamptz not null default now()
);
```

### 3.3 Syntaxe du champ `content`

**`type = 'association'`**

```
13|Bouches-du-Rhône
06|Alpes-Maritimes
```

Chaque ligne non vide contenant un `|` produit une paire `{front, back}` : tout ce qui précède le
premier `|` est `front`, tout ce qui suit est `back`. Les lignes sans `|` sont ignorées.

**`type = 'recitation'`**

```
Maître Corbeau, sur un arbre perché,
Tenait en son bec un fromage.
```

Chaque ligne non vide **sans** `|` produit un item `{text}`, dans l'ordre d'apparition — cet ordre
porte l'information de séquence. Les lignes contenant un `|` sont ignorées.

Le parsing vit dans `app/src/lib/parseContent.ts` et n'a aucune contrepartie en base : la base ne
connaît que du texte.

### 3.4 Clé de ligne (`line_key`)

`line_key = front + '|' + back` (`pairLineKey`), une fois les deux moitiés détourées des espaces.
Elle dépend du **contenu de la ligne, pas de sa position** :

- réordonner les lignes ou en ajouter n'affecte pas la mémorisation déjà acquise ;
- corriger le texte d'une ligne crée une nouvelle clé : la ligne redevient à réviser, et
  l'ancienne clé reste en base sans jamais réapparaître.

Deux lignes rigoureusement identiques partagent la même clé : les mémoriser revient au même geste.

---

## 4. Authentification, permissions et modération

### 4.1 Authentification

Supabase Auth, provider « email » : mot de passe ou lien magique, au choix, sans distinction en
base. Un compte créé reçoit le rôle `membre` par un trigger `after insert on auth.users`.

### 4.2 Lecture et écriture (RLS)

| Table | Lecture | Écriture |
|---|---|---|
| `cards` | `public` et `unlisted` pour tout le monde ; `private` pour son propriétaire. Une carte `deleted` n'est visible que de son propriétaire et des manager/admin | Insertion : tout utilisateur authentifié, comme `owner_id`, en statut `normal`. Mise à jour : tout utilisateur authentifié (§4.3 pour le statut) |
| `progress` | Ses propres lignes | Ses propres lignes |
| `pair_progress` | Ses propres lignes | Ses propres lignes |
| `card_revisions` | Les révisions des cartes que l'on a le droit de lire | Aucune écriture cliente — alimentée par trigger |
| `user_roles` | Soi-même, ou tout le monde pour un manager/admin | Aucune écriture cliente — SQL uniquement |

`unlisted` relève de la discrétion, pas de la confidentialité : la carte n'apparaît pas dans la
liste (filtre côté client) mais reste lisible par l'API pour qui connaît — ou devine — son `id`.
Seul `private` restreint réellement la lecture.

### 4.3 Suppression douce, statuts et rôles

- Pas de `delete` SQL sur `cards` : la suppression est un changement de `status`, réversible.
- Rôles (un par utilisateur, `membre` par défaut) :
  - **membre** : crée des cartes, et peut faire passer une carte `normal` → `signalee`. Rien
    d'autre : il ne peut ni supprimer, ni restaurer, ni « re-signaler » une carte déjà supprimée.
  - **manager / admin** : toutes les transitions, dont `deleted` (suppression douce) et le retour
    à `normal` (restauration).
- Contrôle appliqué par le trigger `enforce_card_status_transition` (`before update on cards`) :
  **la logique de droits vit entièrement en base**. Le front affiche l'action et relaie l'erreur.
- L'identité d'une carte (`id`, `owner_id`, `created_at`) est figée par le trigger
  `freeze_card_identity` : l'édition ouverte porte sur le contenu, pas sur la propriété.
- L'attribution des rôles se fait par écriture SQL directe dans `user_roles`.

---

## 5. Règles de progression (portées par la base)

Migration `0006`, corrigée par `0007`. Le client n'exprime qu'une intention ; l'horodatage, les
compteurs et les purges sont calculés en base, ce qui supprime tout cycle lecture-puis-écriture
côté client et la condition de course associée.

| Règle | Énoncé | Mise en œuvre |
|---|---|---|
| **R1** | Mémoriser une ligne implique que la carte est en cours d'étude. Une carte achevée puis reprise repasse « en cours », sans que son compteur de révisions ni sa date de dernière révision soient touchés | Trigger `pair_progress_marks_card_in_progress` |
| **R2** | Démarquer une ligne ne change pas le statut : on ne « dé-commence » pas une étude entamée | Absence de règle — aucun trigger |
| **R3** | Achever une carte purge ses lignes mémorisées : le suivi ligne à ligne n'a plus d'objet | Trigger `progress_clears_pair_progress_on_completion` |
| **R4** | Enregistrer une révision horodate la carte et incrémente son compteur | Fonction `record_review(p_card_id, p_status)`, `security invoker` |

`last_reviewed_at` n'est écrit que par R4 : une carte peut donc être « en cours » avec
`review_count = 0` et aucune date, si elle n'a été qu'effleurée depuis l'écran Visualiser.

---

## 6. Parcours utilisateur

1. **Créer une carte** : titre, type, langue, visibilité, contenu. Le type est fixé à la création
   (il détermine l'interprétation du contenu) ; tout le reste est modifiable ensuite.
2. **Visualiser** (`/cards/:id`) : le contenu parsé. Pour une carte d'association, un clic sur une
   ligne bascule sa mémorisation, les compteurs « mémorisées / à réviser » se mettent à jour, et
   le tiroir d'options permet de masquer les lignes acquises ou de mélanger l'affichage.
3. **Éditer** (`/cards/:id/edit`) : zone de texte brut → une seule requête `update`. Le trigger
   `archive_card_revision` archive l'ancienne valeur avant écriture. L'historique se consulte et
   se restaure depuis le même écran, par n'importe quel utilisateur authentifié.
4. **Réviser une association** (`/cards/:id/review`) : file de cartes à retourner, dans le
   désordre. Si une partie des lignes est déjà mémorisée, l'utilisateur choisit son périmètre
   (« ce qui reste » ou « tout »). Pouce en haut / glissé vers la droite : la ligne est mémorisée
   et passe sur la pile « ok » ; pouce en bas : elle repart plus loin dans la pile à réviser.
5. **Réciter** : parcours séquentiel, une phrase à la fois, dans l'ordre du texte.
6. **Fin de session** : la carte se marque « terminé » ou « en cours » (R3/R4), ou l'utilisateur
   relance un cycle — ce qui, si tout était mémorisé, efface la mémorisation pour tout reproposer.
7. **Signaler / supprimer / restaurer** : changement de `status`, accepté ou refusé par la base
   selon le rôle (§4.3).

---

## 7. Frontend

- React 19 (SPA) + React Router, client `@supabase/supabase-js`, build Vite, PWA
  (`vite-plugin-pwa`, mise à jour automatique vérifiée au démarrage puis toutes les heures).
- Pas de bibliothèque d'état : l'état serveur est rechargé par écran, la session vit dans
  `AuthContext`.

| Fichier | Rôle |
|---|---|
| `src/App.tsx` | Routes : liste, login, création, et carte (`/cards/:id`) avec ses onglets |
| `src/context/AuthContext.tsx` | Session Supabase, rôle de l'utilisateur, méthodes de connexion |
| `src/components/Nav.tsx` | Barre supérieure et menu utilisateur |
| `src/components/OptionsDrawer.tsx` | Tiroir latéral générique : navigation, filtres, actions |
| `src/pages/CardsList.tsx` | Liste et filtres (type, en cours, cartes supprimées) |
| `src/pages/CardPage.tsx` | Chargement de la carte, tiroir d'options, actions de modération ; fournit le contexte d'`Outlet` à ses onglets |
| `src/pages/CardView.tsx` | Onglet Visualiser, mémorisation ligne à ligne |
| `src/pages/CardEditForm.tsx` | Onglet Éditer, historique et restauration |
| `src/pages/ReviewSession.tsx` | Onglet Réviser (association et récitation) |
| `src/lib/parseContent.ts` | Parsing du contenu, clé de ligne, mélange |

Les options d'affichage propres à un onglet (masquer les lignes mémorisées, mélanger) sont rendues
par `CardPage` dans son tiroir : l'onglet déclare via `setViewOptions` celles qui s'appliquent, et
lit leur état dans le contexte d'`Outlet`.

---

## 8. Risques connus et limites acceptées

- **Écrasement en cas d'édition simultanée** : une écriture remplace l'intégralité du `content`.
  `card_revisions` permet un rollback manuel mais ne prévient pas la perte initiale.
- **Édition totalement ouverte, sans validation préalable** : modèle wiki assumé ; l'historique est
  le seul garde-fou (a posteriori, jamais de blocage a priori).
- **`unlisted` n'est pas une protection** : voir §4.2. Une carte qui ne doit pas être lue doit être
  `private`.
- **Pas de co-édition temps réel** : hors périmètre.
- **Modération sans file dédiée** : ni liste des cartes signalées, ni blocage d'utilisateur.
- **Pas de suivi par ligne pour la récitation** : le parcours est toujours intégral.
- **Mémorisation attachée au texte exact d'une ligne** : corriger une faute de frappe dans une
  ligne remet cette ligne à réviser (§3.4).
- **`review_count` et `last_reviewed_at` ne sont affichés nulle part** : ils sont tenus à jour par
  R4 mais aucun écran ne les expose encore.
- **Aucun test automatisé** : le filet est le typecheck (`tsc -b`) et le linter.

---

## 9. Hors périmètre

- Co-édition temps réel (CRDT / WebSockets).
- Répétition espacée algorithmique (SM-2/FSRS) : le statut de carte reste binaire et manuel, et la
  mémorisation par ligne reste un simple booléen sans planification.
- Classements ou comparaison sociale des scores.
- Export/import multi-format (CSV, Anki `.apkg`, etc.).
- Gestion des rôles depuis l'interface.

---

## 10. Corrections apportées par la migration `0007`

| # | Symptôme | Correction |
|---|---|---|
| C1 | La policy de lecture de `user_roles` s'interrogeait elle-même : Postgres refusait la requête (`42P17`, récursion infinie). Personne ne pouvait lire son rôle, donc les actions de modération n'apparaissaient jamais, y compris pour un admin | La policy passe par `public.current_user_role()` (`security definer`), qui casse le cycle |
| C2 | Un membre pouvait « signaler » une carte supprimée, ce qui la remettait en circulation | Un membre ne peut signaler qu'une carte `normal` |
| C3 | L'édition étant ouverte, `owner_id` pouvait être réécrit : on pouvait s'approprier une carte privée, donc la lire | `id`, `owner_id` et `created_at` sont figés par trigger |
| C4 | `unlisted` se comportait exactement comme `private` | Lecture ouverte pour `unlisted`, exclusion de la liste côté client |
| C5 | Mémoriser une ligne horodatait `last_reviewed_at` alors qu'aucune révision n'avait eu lieu | R1 n'écrit plus que le statut ; rattrapage des lignes existantes |
| C6 | Les fonctions de trigger `security definer` étaient appelables en RPC par n'importe qui | `revoke execute` sur ces fonctions |
| C7 | L'historique était lisible par tout le monde : le contenu d'une carte privée fuitait par ses révisions | La lecture d'une révision suit la visibilité de sa carte (+ index sur `card_revisions.card_id`) |
