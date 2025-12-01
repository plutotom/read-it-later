import { useEffect, useLayoutEffect } from 'react'
import type { BasicTarget } from './use-click-away'
import { createEffectWithTarget } from './create-effect-with-target'

/**
 * A hook that runs an effect when the target changes
 * @param effect - The effect function to run
 * @param deps - Dependencies including targets
 * @param target - The target elements
 * @returns void
 */
export function useEffectWithTarget(
  effect: (target: Element | null) => void | (() => void),
  deps: any[],
  target: BasicTarget | BasicTarget[],
) {
  useEffect(() => {
    return createEffectWithTarget(effect, Array.isArray(target) ? target : [target])
  }, deps)
}

/**
 * A hook that runs an effect with layout effect when the target changes
 * @param effect - The effect function to run
 * @param deps - Dependencies including targets
 * @param target - The target elements
 * @returns void
 */
export function useLayoutEffectWithTarget(
  effect: (target: Element | null) => void | (() => void),
  deps: any[],
  target: BasicTarget | BasicTarget[],
) {
  useLayoutEffect(() => {
    return createEffectWithTarget(effect, Array.isArray(target) ? target : [target])
  }, deps)
}



