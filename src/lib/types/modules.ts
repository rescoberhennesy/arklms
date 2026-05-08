// Pure types and constants for modules. No server actions, no DB access --
// safe to import from both server actions and client components.

export type ModuleTerm = 'prelim' | 'midterm' | 'prefinal' | 'final';

export const MODULE_TERMS: readonly ModuleTerm[] = [
  'prelim',
  'midterm',
  'prefinal',
  'final',
] as const;

export const MODULE_TERM_LABELS: Record<ModuleTerm, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  prefinal: 'Prefinal',
  final: 'Final',
};