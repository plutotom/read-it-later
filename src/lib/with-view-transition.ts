/**
 * Wraps client-side navigation in the View Transitions API when available,
 * so `::view-transition-*` rules in globals.css run for list ↔ article, etc.
 */
export function withViewTransition(run: () => void): void {
  if (typeof document === "undefined") {
    run();
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (update: () => void) => void;
  };

  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => {
      run();
    });
  } else {
    run();
  }
}
