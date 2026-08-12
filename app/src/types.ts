export type CardType = 'association' | 'recitation';
export type Difficulty = 'facile' | 'moyen' | 'difficile';
export type Visibility = 'public' | 'unlisted' | 'private';
export type ProgressStatus = 'en_cours' | 'termine';
export type CardStatus = 'normal' | 'signalee' | 'deleted';
export type UserRole = 'membre' | 'manager' | 'admin';

export interface Card {
  id: string;
  title: string;
  type: CardType;
  lang: string;
  difficulty: Difficulty;
  content: string;
  visibility: Visibility;
  status: CardStatus;
  owner_id: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface Progress {
  user_id: string;
  card_id: string;
  status: ProgressStatus;
  last_reviewed_at: string | null;
  review_count: number;
}

export interface CardRevision {
  id: number;
  card_id: string;
  content: string;
  edited_by: string | null;
  edited_at: string;
}
