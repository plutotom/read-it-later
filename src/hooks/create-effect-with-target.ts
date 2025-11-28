import type { BasicTarget } from "./use-click-away";

/**
 * Utility to create an effect that works with DOM targets
 * @param effect - The effect function to run
 * @param deps - Dependencies for the effect
 * @returns A cleanup function
 */
export function createEffectWithTarget(
  effect: (target: Element | null) => void | (() => void),
  deps: BasicTarget<any>[],
) {
  const destroyRef = { current: undefined as (() => void) | undefined };

  const cleanup = () => {
    if (destroyRef.current) {
      destroyRef.current();
      destroyRef.current = undefined;
    }
  };

  deps.forEach((dep) => {
    const target = getTargetElement(dep);
    if (target) {
      cleanup();
      destroyRef.current = effect(target) as (() => void) | undefined;
    }
  });

  return cleanup;
}

/**
 * Utility function to get the target element from various target types
 * @param target - The target to get element from
 * @returns The target element or null
 */
export function getTargetElement(
  target?: BasicTarget | BasicTarget[],
): Element | null {
  if (!target) return null;

  let targetElement: Element | null = null;

  if (Array.isArray(target)) {
    targetElement = (target[0] as Element) ?? null;
  } else if (typeof target === "function") {
    targetElement = target() ?? null;
  } else if ("current" in target) {
    targetElement = target.current ?? null;
  } else {
    targetElement = target ?? null;
  }

  return targetElement;
}
