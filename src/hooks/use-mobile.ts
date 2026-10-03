import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

const subscribe = (onStoreChange: () => void): (() => void) => {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

const getSnapshot = (): boolean => window.innerWidth < MOBILE_BREAKPOINT

const getServerSnapshot = (): boolean => false

export const useIsMobile = (): boolean =>
  React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
