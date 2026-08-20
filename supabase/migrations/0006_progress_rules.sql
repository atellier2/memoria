-- Memoria — règles de gestion du statut de progression, portées par la base.
--
-- Ces règles vivaient dans le client (app/src/lib/progress.ts et
-- ReviewSession.markStatus) : passage automatique en "en cours", incrément du
-- compteur de révisions par lecture-puis-écriture, purge des lignes mémorisées
-- à l'achèvement. La base en devient la seule garante, quel que soit l'appelant.
--
--   R1. Mémoriser une ligne implique que la carte est en cours d'étude. Une
--       carte achevée puis reprise repasse "en cours", sans que son compteur de
--       révisions ni sa date de dernière révision soient touchés.
--   R2. Démarquer une ligne ne change pas le statut : on ne "dé-commence" pas
--       une étude déjà entamée. (Aucun trigger : c'est l'absence de règle.)
--   R3. Achever une carte purge ses lignes mémorisées : le suivi ligne à ligne
--       n'a plus d'objet une fois la carte entière considérée comme sue.
--   R4. Enregistrer une révision horodate la carte et incrémente son compteur.

-- ---------------------------------------------------------------
-- R1 — une ligne mémorisée met la carte en cours d'étude.
-- Le `where` de la clause de conflit évite toute écriture quand la carte est
-- déjà en cours, et l'update ne porte que sur le statut : review_count et
-- last_reviewed_at d'une carte reprise sont préservés.
create function public.mark_card_in_progress() returns trigger as $$
begin
  insert into public.progress (user_id, card_id, status, last_reviewed_at)
  values (new.user_id, new.card_id, 'en_cours', now())
  on conflict (user_id, card_id) do update
    set status = 'en_cours'
    where progress.status is distinct from 'en_cours';
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger pair_progress_marks_card_in_progress
  after insert on pair_progress
  for each row execute function public.mark_card_in_progress();

-- ---------------------------------------------------------------
-- R3 — achever une carte purge son suivi ligne à ligne.
-- Pas de récursion possible avec R1 : ce trigger ne réagit qu'à 'termine',
-- statut que R1 n'écrit jamais.
create function public.clear_pair_progress_on_completion() returns trigger as $$
begin
  if new.status = 'termine' then
    delete from public.pair_progress
     where user_id = new.user_id and card_id = new.card_id;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger progress_clears_pair_progress_on_completion
  after insert or update of status on progress
  for each row execute function public.clear_pair_progress_on_completion();

-- ---------------------------------------------------------------
-- R4 — enregistrer une révision terminée.
-- Le client n'exprime plus qu'une intention ("j'ai révisé cette carte, voici
-- l'issue") : l'horodatage et l'incrément du compteur sont calculés ici, ce qui
-- supprime le cycle lecture-puis-écriture côté client et sa condition de course.
-- Droits de l'appelant (invoker) : la policy progress_owner_only s'applique, et
-- l'utilisateur est déduit de auth.uid() plutôt que reçu en paramètre.
create function public.record_review(p_card_id uuid, p_status text)
returns public.progress as $$
declare
  result public.progress;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise pour enregistrer une révision.';
  end if;

  if p_status not in ('en_cours', 'termine') then
    raise exception 'Statut de révision invalide : %', p_status;
  end if;

  insert into public.progress (user_id, card_id, status, last_reviewed_at, review_count)
  values (auth.uid(), p_card_id, p_status, now(), 1)
  on conflict (user_id, card_id) do update
    set status = excluded.status,
        last_reviewed_at = excluded.last_reviewed_at,
        review_count = progress.review_count + 1
  returning * into result;

  return result;
end;
$$ language plpgsql security invoker set search_path = public;
