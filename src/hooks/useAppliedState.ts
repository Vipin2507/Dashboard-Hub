import * as React from "react";

type Options<T> = {
  /** Custom equality comparator; defaults to Object.is */
  isEqual?: (a: T, b: T) => boolean;
};

/**
 * Keeps a "draft" state for inputs and an "applied" state used for data rendering.
 * Call `apply()` to copy draft → applied; `clear()` resets both to initial.
 */
export function useAppliedState<T>(initial: T, options?: Options<T>) {
  const isEqual = options?.isEqual ?? Object.is;

  const [applied, setApplied] = React.useState<T>(initial);
  const [draft, setDraft] = React.useState<T>(initial);

  const hasChanges = !isEqual(draft, applied);

  const apply = React.useCallback(() => {
    setApplied(draft);
  }, [draft]);

  const clear = React.useCallback(() => {
    setDraft(initial);
    setApplied(initial);
  }, [initial]);

  const resetDraftToApplied = React.useCallback(() => {
    setDraft(applied);
  }, [applied]);

  return {
    applied,
    setApplied,
    draft,
    setDraft,
    hasChanges,
    apply,
    clear,
    resetDraftToApplied,
  };
}

