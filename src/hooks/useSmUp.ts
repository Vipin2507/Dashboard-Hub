import { useEffect, useState } from 'react';

const SM_PX = 640;

/** True when viewport is Tailwind `sm` and up (640px+). */
export function useSmUp() {
  const [smUp, setSmUp] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${SM_PX}px)`).matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SM_PX}px)`);
    const onChange = () => setSmUp(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return smUp;
}

const MD_PX = 768;

/** True when viewport is Tailwind `md` and up (768px+) — tablet landscape / desktop. */
export function useMdUp() {
  const [mdUp, setMdUp] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(`(min-width: ${MD_PX}px)`).matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MD_PX}px)`);
    const onChange = () => setMdUp(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mdUp;
}
