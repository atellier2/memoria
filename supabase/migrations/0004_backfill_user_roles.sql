-- Memoria — comble les rôles manquants pour les utilisateurs créés avant
-- la migration 0002 (le trigger handle_new_user ne s'applique qu'aux
-- nouvelles inscriptions, pas aux comptes existants).
insert into public.user_roles (user_id, role)
select id, 'membre' from auth.users
on conflict (user_id) do nothing;
