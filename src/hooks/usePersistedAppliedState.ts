import * as React from "react";
import { useAppliedState } from "@/hooks/useAppliedState";
import {
  clearSessionFilters,
  loadSessionFilters,
  saveSessionFilters,
  type FilterSessionKey,
} from "@/lib/filterSessionPersistence";

type Options<T> = {
  isEqual?: (a: T, b: T) => boolean;
};

/**
 * Draft/applied filter state that restores from sessionStorage on mount and
 * persists applied values on Apply; Clear resets to initial and removes session entry.
 */
export function usePersistedAppliedState<T>(
  sessionKey: FilterSessionKey,
  initial: T,
  options?: Options<T>,
) {
  const persisted = React.useMemo(() => loadSessionFilters<T>(sessionKey), [sessionKey]);
  const baseline = persisted ?? initial;

  const isEqual = options?.isEqual ?? Object.is;
  const state = useAppliedState(baseline, { isEqual });

  const apply = React.useCallback(() => {
    state.setApplied(state.draft);
    saveSessionFilters(sessionKey, state.draft);
  }, [sessionKey, state]);

  const clear = React.useCallback(() => {
    clearSessionFilters(sessionKey);
    state.setDraft(initial);
    state.setApplied(initial);
  }, [initial, sessionKey, state]);

  const hasActiveAppliedFilters = !isEqual(state.applied, initial);

  return {
    ...state,
    apply,
    clear,
    hasActiveAppliedFilters,
  };
}
