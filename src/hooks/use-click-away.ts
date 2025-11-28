import { useEffect, useRef } from 'react'
import { useLatest } from './use-latest'

export type TargetValue<T> = T | undefined | null

export type TargetType = HTMLElement | Element | Window | Document

export type BasicTarget<T extends TargetType = Element> =
  | (() => TargetValue<T>)
  | TargetValue<T>
  | React.RefObject<TargetValue<T>>

export type DocumentEventKey = keyof DocumentEventMap

/**
 * A hook to click away from an element
 * @param onClickAway - The function to call when the user clicks away from the target
 * @param target - The target to click away from
 * @param eventName - The event to listen for
 */
export function useClickAway<T extends Event = Event>(
  onClickAway: (event: T) => void,
  target: BasicTarget | BasicTarget[],
  eventName: DocumentEventKey | DocumentEventKey[] = 'click',
): void {
  const onClickAwayRef = useLatest(onClickAway)
  const targetRef = useRef<BasicTarget | BasicTarget[]>()

  targetRef.current = target

  useEffect(() => {
    const handler = (event: any) => {
      const targets = Array.isArray(targetRef.current)
        ? targetRef.current
        : [targetRef.current]

      const isClickAway = targets.every((target) => {
        const targetElement = getTargetElement(target)
        return !targetElement || !targetElement.contains(event.target)
      })

      if (isClickAway) {
        onClickAwayRef.current(event)
      }
    }

    const eventNames = Array.isArray(eventName) ? eventName : [eventName]

    eventNames.forEach((event) => {
      document.addEventListener(event, handler)
    })

    return () => {
      eventNames.forEach((event) => {
        document.removeEventListener(event, handler)
      })
    }
  }, [eventName])
}

/**
 * Get the target element from various target types
 * @param target - The target to get element from
 * @returns The target element or null
 */
function getTargetElement(
  target?: BasicTarget,
): Element | null {
  if (!target) return null

  if (typeof target === 'function') {
    return target()
  }

  if ('current' in target) {
    return target.current
  }

  return target
}
