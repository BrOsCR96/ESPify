import type { IEspLoaderTerminal } from "esptool-js"

export type EspTerminalEventType = "clean" | "line" | "chunk"

export interface EspTerminalEvent {
  type: EspTerminalEventType
  data: string
}

type EspTerminalListener = (event: EspTerminalEvent) => void

const listeners = new Set<EspTerminalListener>()

/**
 * Subscribes a consumer (e.g. xterm in phase 5) to the ESPLoader output
 * stream. Returns the unsubscribe function.
 */
export const subscribeEspTerminal = (
  listener: EspTerminalListener
): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const emit = (type: EspTerminalEventType, data: string): void => {
  listeners.forEach((listener) => listener({ type, data }))
}

/**
 * Minimal terminal for the ESPLoader. It holds no state: it only re-emits
 * each text chunk to subscribers and the browser console.
 */
export const espLoaderTerminal: IEspLoaderTerminal = {
  clean: () => {
    emit("clean", "")
  },
  writeLine: (data: string) => {
    emit("line", data)
    console.debug(`[esptool] ${data}`)
  },
  write: (data: string) => {
    emit("chunk", data)
  },
}
