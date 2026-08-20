import { supabase } from './supabase';

// Mémoriser une ligne implique que la carte est en cours d'étude : sans ça, une
// carte dont on coche des lignes resterait sans statut (pas de badge "En cours",
// absente du filtre "cartes en cours d'étude"), car `progress` n'était écrit que
// par les boutons de fin de session de révision.
export async function ensureCardInProgress(userId: string, cardId: string): Promise<void> {
  const { data } = await supabase
    .from('progress')
    .select('status')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .maybeSingle();

  if (data?.status === 'en_cours') return;

  if (data) {
    // Carte déjà suivie (donc marquée "terminé") et reprise : on la repasse en
    // cours sans toucher au compteur de révisions ni à la dernière date.
    await supabase.from('progress').update({ status: 'en_cours' }).eq('user_id', userId).eq('card_id', cardId);
    return;
  }

  await supabase.from('progress').upsert(
    { user_id: userId, card_id: cardId, status: 'en_cours', last_reviewed_at: new Date().toISOString() },
    { onConflict: 'user_id,card_id' },
  );
}
