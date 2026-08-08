export interface AssociationPair {
  front: string;
  back: string;
}

export interface RecitationLine {
  text: string;
}

// Chaque ligne non vide contenant un `|` produit une paire {front, back}.
// Tout ce qui précède le premier `|` est front, tout ce qui suit est back.
export function parseAssociation(content: string): AssociationPair[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes('|'))
    .map((line) => {
      const separatorIndex = line.indexOf('|');
      return {
        front: line.slice(0, separatorIndex).trim(),
        back: line.slice(separatorIndex + 1).trim(),
      };
    });
}

// Chaque ligne non vide sans `|` produit un item {text}, dans l'ordre d'apparition.
export function parseRecitation(content: string): RecitationLine[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes('|'))
    .map((text) => ({ text }));
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
