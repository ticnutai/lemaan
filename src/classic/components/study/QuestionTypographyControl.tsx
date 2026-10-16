import { useCallback, useMemo, type CSSProperties } from "react";
import { useStudy } from "@/lib/study/store";
import {
  ANSWER_TYPOGRAPHY_KEY,
  CombinedTypographyDialog,
  DEFAULT_QUIZ_TYPOGRAPHY,
  QUIZ_TYPOGRAPHY_KEY,
  loadAnswerTypography,
  loadTypography,
  storeTypography,
  typographyToBgStyle,
  typographyToStyle,
  type QuizTypography,
} from "./QuizTypographyPanel";

/**
 * One canonical typography preference for question lists and active practice.
 * The store already persists uiPrefs local-first and synchronizes it to the
 * signed-in user's user_settings row, so this adds no parallel persistence.
 */
export function useQuestionTypographyPreferences() {
  const { state, setUiPref } = useStudy();

  const questionTypography = useMemo<QuizTypography>(() => ({
    ...DEFAULT_QUIZ_TYPOGRAPHY,
    ...loadTypography(QUIZ_TYPOGRAPHY_KEY),
    ...(state.uiPrefs?.studyTypography as Partial<QuizTypography> | undefined),
  }), [state.uiPrefs?.studyTypography]);

  const answerTypography = useMemo<QuizTypography>(() => ({
    ...DEFAULT_QUIZ_TYPOGRAPHY,
    ...loadAnswerTypography(),
    ...(state.uiPrefs?.studyAnswerTypography as Partial<QuizTypography> | undefined),
  }), [state.uiPrefs?.studyAnswerTypography]);

  const setQuestionTypography = useCallback((next: QuizTypography) => {
    storeTypography(next, QUIZ_TYPOGRAPHY_KEY);
    setUiPref("studyTypography", next as unknown as Record<string, unknown>);
  }, [setUiPref]);

  const setAnswerTypography = useCallback((next: QuizTypography) => {
    storeTypography(next, ANSWER_TYPOGRAPHY_KEY);
    setUiPref("studyAnswerTypography", next as unknown as Record<string, unknown>);
  }, [setUiPref]);

  const questionTextStyle = useMemo<CSSProperties>(() => ({
    ...typographyToStyle(questionTypography),
    textAlign: questionTypography.align,
  }), [questionTypography]);

  const questionCardStyle = useMemo<CSSProperties>(
    () => typographyToBgStyle(questionTypography),
    [questionTypography],
  );

  return {
    questionTypography,
    answerTypography,
    setQuestionTypography,
    setAnswerTypography,
    questionTextStyle,
    questionCardStyle,
  };
}

export function QuestionTypographyControl({
  preferences,
}: {
  preferences: ReturnType<typeof useQuestionTypographyPreferences>;
}) {
  return (
    <CombinedTypographyDialog
      questionValue={preferences.questionTypography}
      onQuestionChange={preferences.setQuestionTypography}
      answerValue={preferences.answerTypography}
      onAnswerChange={preferences.setAnswerTypography}
    />
  );
}
