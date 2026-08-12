-- Memoria — suppression douce des cards par statut + rôles utilisateur
-- Voir docs/spec.md §4 pour le détail des décisions produit.
--
-- L'authentification par mot de passe ne nécessite aucune migration : le
-- provider "email" de Supabase Auth gère lien magique et mot de passe sans
-- configuration SQL additionnelle (voir app/src/context/AuthContext.tsx).

-- ---------------------------------------------------------------
-- Rôles utilisateur — gérés exclusivement en base (aucune écriture
-- possible depuis le client : pas de policy insert/update/delete ci-dessous).
create table user_roles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'membre' check (role in ('membre', 'manager', 'admin')),
  created_at  timestamptz not null default now()
);

alter table user_roles enable row level security;

create policy "user_roles_read_self_or_privileged" on user_roles
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role in ('manager', 'admin')
    )
  );

-- Nouvel utilisateur → rôle 'membre' par défaut ; un admin élève le rôle
-- directement en base (update manuel sur user_roles).
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.user_roles (user_id, role) values (new.id, 'membre')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.current_user_role() returns text as $$
  select role from public.user_roles where user_id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------
-- Statut de modération de la card — suppression douce.
-- 'normal'   : état par défaut, visible normalement.
-- 'signalee' : signalée comme problématique par un membre, reste visible.
-- 'deleted'  : supprimée en douceur, masquée du grand public.
alter table cards
  add column status text not null default 'normal' check (status in ('normal', 'signalee', 'deleted'));

-- Contrôle des transitions de statut, indépendant des policies RLS
-- puisqu'il porte sur une seule colonne et dépend du rôle de l'auteur :
--   - membre           : ne peut que signaler ('signalee')
--   - manager / admin  : peut supprimer ('deleted') ou restaurer ('normal'),
--                        et signaler également
create function enforce_card_status_transition() returns trigger as $$
declare
  actor_role text;
begin
  if new.status is distinct from old.status then
    actor_role := public.current_user_role();

    if actor_role is null then
      raise exception 'Aucun rôle défini pour cet utilisateur.';
    elsif actor_role = 'membre' and new.status <> 'signalee' then
      raise exception 'Un membre ne peut que signaler une carte.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger cards_enforce_status_transition
  before update on cards
  for each row execute function enforce_card_status_transition();

-- ---------------------------------------------------------------
-- Une card supprimée ne doit pas apparaître dans la consultation publique,
-- mais reste visible pour son propriétaire et pour manager/admin (revue).
drop policy "cards_read_public" on cards;
create policy "cards_read_public" on cards
  for select using (
    (visibility = 'public' or owner_id = auth.uid())
    and (status <> 'deleted' or owner_id = auth.uid() or public.current_user_role() in ('manager', 'admin'))
  );

-- Une card créée démarre toujours en statut 'normal' — le contournement du
-- contrôle de transition via un insert direct n'est pas permis.
drop policy "cards_insert_authenticated" on cards;
create policy "cards_insert_authenticated" on cards
  for insert with check (auth.uid() = owner_id and status = 'normal');
