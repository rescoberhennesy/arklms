'use client';

import { Check, X, Minus } from 'lucide-react';
import type {
  QuizQuestion,
  QuizResponse,
  McSingleConfig,
  McMultiConfig,
  TrueFalseConfig,
  ShortAnswerConfig,
  MatchingConfig,
  McSingleAnswer,
  McMultiAnswer,
  TrueFalseAnswer,
  ShortAnswerAnswer,
  EssayAnswer,
  MatchingAnswer,
} from '@/lib/types/quizzes';

interface StudentAnswerViewProps {
  question: QuizQuestion;
  response: QuizResponse | null;
}

// Marker shown next to each option/cell:
//   correct + picked → green check
//   correct + not picked → gray dash (the right answer the student missed)
//   incorrect + picked → red X
//   incorrect + not picked → nothing
function Marker({
  correct,
  picked,
}: {
  correct: boolean;
  picked: boolean;
}) {
  if (correct && picked) {
    return <Check className="h-4 w-4 text-green-600" aria-label="Correct" />;
  }
  if (correct && !picked) {
    return (
      <Minus
        className="h-4 w-4 text-gray-400"
        aria-label="Correct answer (not picked)"
      />
    );
  }
  if (!correct && picked) {
    return <X className="h-4 w-4 text-red-600" aria-label="Incorrect pick" />;
  }
  return <span className="h-4 w-4" aria-hidden />;
}

export default function StudentAnswerView({
  question,
  response,
}: StudentAnswerViewProps) {
  if (!response) {
    return (
      <p className="text-sm italic text-gray-400">
        No response — student did not answer this question.
      </p>
    );
  }

  switch (question.questionKind) {
    case 'mc_single': {
      const cfg = question.config as McSingleConfig;
      const ans = response.answer as McSingleAnswer;
      const correctIdx = cfg.correct[0];
      const pickedIdx = ans.selected;
      return (
        <ul className="space-y-1.5">
          {cfg.options.map((opt, i) => {
            const isCorrect = i === correctIdx;
            const isPicked = i === pickedIdx;
            return (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  isPicked
                    ? isCorrect
                      ? 'bg-green-50 text-green-900'
                      : 'bg-red-50 text-red-900'
                    : isCorrect
                      ? 'bg-gray-50 text-gray-700'
                      : 'text-gray-600'
                }`}
              >
                <Marker correct={isCorrect} picked={isPicked} />
                <span className="flex-1">{opt}</span>
                {isPicked && (
                  <span className="text-xs font-medium uppercase tracking-wide">
                    Picked
                  </span>
                )}
              </li>
            );
          })}
          {pickedIdx === -1 && (
            <li className="text-xs italic text-gray-400">No option selected.</li>
          )}
        </ul>
      );
    }

    case 'mc_multi': {
      const cfg = question.config as McMultiConfig;
      const ans = response.answer as McMultiAnswer;
      const correctSet = new Set(cfg.correct);
      const pickedSet = new Set(ans.selected);
      return (
        <ul className="space-y-1.5">
          {cfg.options.map((opt, i) => {
            const isCorrect = correctSet.has(i);
            const isPicked = pickedSet.has(i);
            return (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  isPicked
                    ? isCorrect
                      ? 'bg-green-50 text-green-900'
                      : 'bg-red-50 text-red-900'
                    : isCorrect
                      ? 'bg-gray-50 text-gray-700'
                      : 'text-gray-600'
                }`}
              >
                <Marker correct={isCorrect} picked={isPicked} />
                <span className="flex-1">{opt}</span>
                {isPicked && (
                  <span className="text-xs font-medium uppercase tracking-wide">
                    Picked
                  </span>
                )}
              </li>
            );
          })}
          {pickedSet.size === 0 && (
            <li className="text-xs italic text-gray-400">
              No options selected.
            </li>
          )}
        </ul>
      );
    }

    case 'true_false': {
      const cfg = question.config as TrueFalseConfig;
      const ans = response.answer as TrueFalseAnswer;
      const correctVal = cfg.correct;
      const pickedVal = ans.selected;
      return (
        <ul className="space-y-1.5">
          {[true, false].map((v) => {
            const isCorrect = v === correctVal;
            const isPicked = v === pickedVal;
            return (
              <li
                key={String(v)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  isPicked
                    ? isCorrect
                      ? 'bg-green-50 text-green-900'
                      : 'bg-red-50 text-red-900'
                    : isCorrect
                      ? 'bg-gray-50 text-gray-700'
                      : 'text-gray-600'
                }`}
              >
                <Marker correct={isCorrect} picked={isPicked} />
                <span className="flex-1">{v ? 'True' : 'False'}</span>
                {isPicked && (
                  <span className="text-xs font-medium uppercase tracking-wide">
                    Picked
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      );
    }

    case 'short_answer': {
      const cfg = question.config as ShortAnswerConfig;
      const ans = response.answer as ShortAnswerAnswer;
      const studentText = ans.text ?? '';
      const isAutoCorrect = response.autoCorrect === true;
      return (
        <div className="space-y-2">
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              isAutoCorrect
                ? 'bg-green-50 text-green-900'
                : 'bg-red-50 text-red-900'
            }`}
          >
            <div className="mb-0.5 text-xs font-medium uppercase tracking-wide opacity-70">
              Student answer
            </div>
            <div className="font-mono">
              {studentText.trim() === '' ? (
                <span className="italic opacity-60">(empty)</span>
              ) : (
                studentText
              )}
            </div>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
            <div className="mb-1 font-medium uppercase tracking-wide opacity-70">
              Acceptable answers
              {cfg.case_sensitive ? ' (case-sensitive)' : ''}
            </div>
            <ul className="font-mono">
              {cfg.acceptable.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    case 'essay': {
      const ans = response.answer as EssayAnswer;
      const text = ans.text ?? '';
      return (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
          {text.trim() === '' ? (
            <span className="italic text-gray-400">(empty response)</span>
          ) : (
            <p className="whitespace-pre-wrap text-gray-800">{text}</p>
          )}
        </div>
      );
    }

    case 'matching': {
      const cfg = question.config as MatchingConfig;
      const ans = response.answer as MatchingAnswer;

      // Map left index → right index for correct + student
      const correctByLeft = new Map<number, number>();
      for (const [l, r] of cfg.pairs) correctByLeft.set(l, r);
      const studentByLeft = new Map<number, number>();
      for (const [l, r] of ans.pairs) studentByLeft.set(l, r);

      return (
        <ul className="space-y-1.5">
          {cfg.left.map((leftLabel, li) => {
            const correctRi = correctByLeft.get(li);
            const studentRi = studentByLeft.get(li);
            const isCorrect = studentRi === correctRi;
            const noAnswer = studentRi === undefined;
            return (
              <li
                key={li}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  noAnswer
                    ? 'text-gray-600'
                    : isCorrect
                      ? 'bg-green-50 text-green-900'
                      : 'bg-red-50 text-red-900'
                }`}
              >
                <Marker correct={isCorrect} picked={!noAnswer} />
                <span className="flex-1">{leftLabel}</span>
                <span className="text-xs">
                  {noAnswer ? (
                    <span className="italic opacity-60">No match</span>
                  ) : (
                    <>
                      <span className="font-medium">
                        {cfg.right[studentRi!]}
                      </span>
                      {!isCorrect && correctRi !== undefined && (
                        <span className="ml-2 opacity-70">
                          (correct: {cfg.right[correctRi]})
                        </span>
                      )}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      );
    }
  }
}