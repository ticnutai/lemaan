/**
 * Product defaults for a clean installation.
 *
 * These values are only fallbacks. A user's local/cloud preferences and an
 * administrator-assigned layout profile continue to take precedence.
 */
export const STUDY_UI_DEFAULTS = Object.freeze({
  dafLearningLayout: "stacked" as const,
  dafLearningNavigationView: "drilldown" as const,
  questionCreationLayout: "content-tree" as const,
  deckBuilderLayout: "shas-spacious" as const,
  deckBuilderNavigationMode: "drilldown" as const,
});

