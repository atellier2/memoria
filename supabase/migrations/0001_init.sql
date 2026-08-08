-- Memoria — schéma initial
-- Voir docs/spec.md pour le détail des décisions produit.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
create table cards (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  type          text not null check (type in ('association', 'recitation')),
  lang          text not null default 'fr',       -- ISO 639-1
  difficulty    text not null default 'moyen'      check (difficulty in ('facile', 'moyen', 'difficile')),
  content       text not null default '',          -- texte brut, voir docs/spec.md §3.3
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
-- indispensable puisque l'édition est ouverte à tous sans validation préalable.
create table card_revisions (
  id            bigint generated always as identity primary key,
  card_id       uuid not null references cards(id) on delete cascade,
  content       text not null,
  edited_by     uuid references auth.users(id),
  edited_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Trigger d'archivage : capture l'ancienne valeur de content avant chaque
-- update, pour que card_revisions ne dépende d'aucune écriture cliente.
create function archive_card_revision() returns trigger as $$
begin
  if new.content is distinct from old.content then
    insert into card_revisions (card_id, content, edited_by)
    values (old.id, old.content, auth.uid());
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger cards_archive_revision
  before update on cards
  for each row execute function archive_card_revision();

-- ---------------------------------------------------------------
-- Row Level Security
alter table cards enable row level security;
alter table progress enable row level security;
alter table card_revisions enable row level security;

-- Lecture publique des cards publiques (+ propriétaire pour les siennes)
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
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Historique lisible par tous ; écrit uniquement via le trigger security definer
create policy "revisions_read_public" on card_revisions
  for select using (true);
