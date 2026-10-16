export type QuestionModePreference = 'flash' | 'multi' | 'both';
export function resolveQuestionMode(saved: unknown, legacy: unknown): QuestionModePreference {
  for (const value of [saved, legacy]) {
    if (value === 'flash' || value === 'multi' || value === 'both') return value;
  }
  return 'multi';
}
export function matchesQuestionMode(card: {type: string; options?: string[]; answer?: string}, mode: QuestionModePreference) {
  if (mode === 'multi') return card.type === 'multiple' || (card.type === 'combo' && !!card.options?.length);
  if (mode === 'flash') return card.type === 'flashcard' || (card.type === 'combo' && !!card.answer);
  return true;
}
