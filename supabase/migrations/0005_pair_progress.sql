-- Memoria — mémorisation par ligne pour les cartes de type association.
-- Voir docs/spec.md pour le détail des décisions produit.
--
-- Une ligne est identifiée par son couple indice|réponse ("line_key"), pas
-- par sa position : réordonner ou ajouter des lignes n'affecte pas la
-- mémorisation déjà acquise, mais corriger le texte d'une ligne la remet à
-- réviser (nouvelle clé). La présence d'une ligne dans cette table signifie
-- qu'elle est mémorisée ; son absence signifie qu'elle reste à réviser.
create table pair_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  card_id      uuid not null references cards(id) on delete cascade,
  line_key     text not null,
  mastered_at  timestamptz not null default now(),
  primary key (user_id, card_id, line_key)
);

alter table pair_progress enable row level security;

create policy "pair_progress_owner_only" on pair_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
