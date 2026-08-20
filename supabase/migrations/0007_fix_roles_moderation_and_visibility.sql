-- Memoria — corrections de cohérence des règles portées par la base.
--
--   C1. La policy de lecture de `user_roles` s'interrogeait elle-même :
--       Postgres détecte la récursion et refuse la requête (42P17). Aucun
--       utilisateur ne pouvait donc lire son propre rôle, et les actions de
--       modération (supprimer / restaurer) n'apparaissaient jamais.
--   C2. Un membre pouvait "signaler" une carte déjà supprimée, ce qui la
--       remettait en circulation : le signalement ne vaut plus que pour une
--       carte normale.
--   C3. L'édition étant ouverte à tous, rien n'empêchait de réécrire
--       `owner_id` (et donc de s'approprier une carte privée) : les colonnes
--       d'identité sont désormais figées.
--   C4. La visibilité `unlisted` se comportait exactement comme `private` :
--       elle redevient ce qu'elle annonce — accessible par lien direct, mais
--       absente de la liste des cartes.
--   C5. Mémoriser une ligne horodatait `last_reviewed_at` alors qu'aucune
--       révision n'avait eu lieu : une carte pouvait afficher une « dernière
--       révision » avec un compteur de révisions à zéro.
--   C6. Les fonctions de trigger `security definer` étaient appelables en RPC
--       par n'importe qui (avertissement du linter Supabase).
--   C7. L'historique était lisible par tout le monde, y compris celui d'une
--       carte privée : le contenu qu'on croyait protégé fuitait par ses
--       révisions.

-- ---------------------------------------------------------------
-- C1 — lecture du rôle sans récursion.
-- `public.current_user_role()` est `security definer` : elle lit user_roles
-- en contournant RLS, ce qui casse le cycle policy → table → policy.
drop policy "user_roles_read_self_or_privileged" on user_roles;
create policy "user_roles_read_self_or_privileged" on user_roles
  for select using (
    user_id = auth.uid()
    or public.current_user_role() in ('manager', 'admin')
  );

-- ---------------------------------------------------------------
-- C2 — un membre ne signale qu'une carte normale.
-- Les transitions autorisées deviennent :
--   membre          : normal   -> signalee
--   manager / admin : n'importe quelle transition
create or replace function enforce_card_status_transition() returns trigger as $$
declare
  actor_role text;
begin
  if new.status is distinct from old.status then
    actor_role := public.current_user_role();

    if actor_role is null then
      raise exception 'Aucun rôle défini pour cet utilisateur.';
    elsif actor_role = 'membre'
      and not (old.status = 'normal' and new.status = 'signalee') then
      raise exception 'Un membre ne peut que signaler une carte normale.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------
-- C3 — colonnes d'identité figées.
-- L'édition ouverte porte sur le contenu et les métadonnées d'une carte, pas
-- sur son identité : les valeurs proposées pour id / owner_id / created_at
-- sont silencieusement remplacées par celles déjà en base.
create function public.freeze_card_identity() returns trigger as $$
begin
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger cards_freeze_identity
  before update on cards
  for each row execute function public.freeze_card_identity();

-- ---------------------------------------------------------------
-- C4 — `unlisted` : lisible par tout le monde (lien direct), mais le client
-- l'exclut de la liste des cartes. C'est de la discrétion, pas de la
-- confidentialité : seul `private` restreint réellement la lecture.
drop policy "cards_read_public" on cards;
create policy "cards_read_public" on cards
  for select using (
    (visibility in ('public', 'unlisted') or owner_id = auth.uid())
    and (status <> 'deleted' or owner_id = auth.uid() or public.current_user_role() in ('manager', 'admin'))
  );

-- ---------------------------------------------------------------
-- C5 — R1 n'horodate plus une révision qui n'a pas eu lieu.
-- Seul `record_review` (R4) écrit `last_reviewed_at` : mémoriser une ligne
-- depuis l'écran de visualisation met la carte « en cours », rien de plus.
create or replace function public.mark_card_in_progress() returns trigger as $$
begin
  insert into public.progress (user_id, card_id, status)
  values (new.user_id, new.card_id, 'en_cours')
  on conflict (user_id, card_id) do update
    set status = 'en_cours'
    where progress.status is distinct from 'en_cours';
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Rattrapage des lignes déjà écrites par l'ancienne version.
update public.progress set last_reviewed_at = null where review_count = 0;

-- ---------------------------------------------------------------
-- C6 — les fonctions de trigger ne sont pas des points d'entrée de l'API.
-- Le déclenchement par trigger ne dépend pas de ce droit ; seule leur
-- invocation directe via /rest/v1/rpc/... disparaît. On révoque aussi le
-- droit hérité de `public`, sans quoi le retrait sur anon / authenticated ne
-- changerait rien.
-- `current_user_role()` et `record_review()` restent exécutables : la
-- première est évaluée dans les policies avec les droits de l'appelant, la
-- seconde est l'API d'enregistrement d'une révision.
revoke execute on function public.archive_card_revision() from public, anon, authenticated;
revoke execute on function public.enforce_card_status_transition() from public, anon, authenticated;
revoke execute on function public.freeze_card_identity() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.mark_card_in_progress() from public, anon, authenticated;
revoke execute on function public.clear_pair_progress_on_completion() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- C7 — l'historique suit la visibilité de sa carte.
-- Le `exists` est évalué avec les droits de l'appelant : la policy de lecture
-- de `cards` s'y applique, donc on ne voit que les révisions des cartes qu'on
-- a déjà le droit de lire.
drop policy "revisions_read_public" on card_revisions;
create policy "revisions_read_visible_cards" on card_revisions
  for select using (
    exists (select 1 from public.cards c where c.id = card_revisions.card_id)
  );

-- L'écran d'édition liste l'historique carte par carte : la clé étrangère ne
-- crée pas d'index, on l'ajoute.
create index card_revisions_card_id_idx on card_revisions (card_id);
