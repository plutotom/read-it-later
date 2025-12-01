import { useRef } from 'react'

/**
 * A hook to get the latest value
 * @param value - The value to track
 * @returns A ref object containing the latest value
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value

  return ref
}



