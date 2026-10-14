// Pure types and constants for modules. No server actions, no DB access --
// safe to import from both server actions and client components.

// 'prefinal' stays in the type so existing database values and lookup
// tables keep working, but ARK doesn't use a Prefinal period, so it is
// left out of MODULE_TERMS (the list every tab, picker and gradebook shows).
export type ModuleTerm = 'prelim' | 'midterm' | 'prefinal' | 'final';

export const MODULE_TERMS: readonly ModuleTerm[] = [
  'prelim',
  'midterm',
  'final',
] as const;

export const MODULE_TERM_LABELS: Record<ModuleTerm, string> = {
  prelim: 'Prelim',
  midterm: 'Midterm',
  prefinal: 'Prefinal',
  final: 'Final',
};