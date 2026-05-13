
// src/lib/hooks/useServerSyncedState.ts
//
// Session 13 — extraction of the signature-based prop-sync pattern that
// appeared in ActivitiesTab, ModulesTab, ActivityAttachmentsPanel,
// QuizAttemptsPanel (and probably more in future).
//
// Why this exists
// ---------------
// In our app a server component fetches data, hands it to a client
// component as a prop, and the client wraps it in `useState` so it can
// apply optimistic updates locally. When the server re-fetches (e.g.
// after `router.refresh()` following a mutation) the prop changes but
// the local `useState` does NOT — `useState(initial)` only consumes its
// initial argument on first mount. The component drifts from the server.
//
// The fix that emerged organically across ~4 components is signature-
// based prop-sync: compute a string fingerprint of the incoming prop,
// remember the last fingerprint we adopted, and re-`setState` whenever
// the fingerprint changes. This avoids both (a) the naive
// `useEffect(() => setState(initial), [initial])` infinite-loop trap
// when `initial` is an object reference changing every render, and
// (b) deep-equality checks that get expensive on big lists.
//
// API
// ---
// Drop-in replacement for `useState` with one extra arg:
//
//   const [items, setItems] = useServerSyncedState(
//     initialItems,
//     (list) => list.map(x => x.id + ':' + x.updatedAt).join('|'),
//   );
//
// The signature function receives the value EXACTLY as it arrived as a
// prop. The hook compares the new signature to the last one it actually
// adopted; if they differ, it overwrites local state and remembers the
// new signature. Local optimistic mutations between server pushes are
// preserved — only an actual prop-signature change triggers resync.
//
// Notes
// -----
// - The signature function should be deterministic and pure. If it
//   returns the same string for two semantically-different values, you
//   lose the resync. If it returns different strings for semantically-
//   identical values, you'll clobber local optimistic state every render.
// - Works equally well for arrays, objects, and primitives. The "list"
//   in the file name is a historical artifact; the carry-forward called
//   it useServerSyncedList but it handles any T.
// - Do NOT use this for paired draft/saved form state (the pattern in
//   ActivityEditor / QuizEditor). That's a different concern (dirty-
//   tracking against a baseline) and needs its own abstraction.

'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export function useServerSyncedState<T>(
  initial: T,
  computeSignature: (value: T) => string,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);

  // Compute the incoming signature each render. Cheap if the signature
  // function is cheap; this is the caller's responsibility.
  const incomingSig = computeSignature(initial);

  // Track the last signature we actually adopted. Initialized to the
  // first-render signature so that the effect's first run is a no-op.
  const lastSyncedSig = useRef(incomingSig);

  useEffect(() => {
    if (incomingSig === lastSyncedSig.current) return;
    lastSyncedSig.current = incomingSig;
    setValue(initial);
    // Depend on the signature, not `initial` itself — depending on
    // `initial` would re-run the effect on every parent render even when
    // the data is semantically unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingSig]);

  return [value, setValue];
}
