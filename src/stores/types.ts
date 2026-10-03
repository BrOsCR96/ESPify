import type { StateCreator } from "zustand"
import type { ESPLoader, Transport } from "esptool-js"

// Domain 1: Ephemeral UI state (no persistence required)
export type FlasherMode = "simple" | "advanced"

/** Long-running flash operation that blocks view switching. */
export type BlockingOperation = "backup" | "flash" | "erase"

export interface UISlice {
  flasherMode: FlasherMode
  /** Flash read (backup) or write (flash) in progress: blocks the sidebar. */
  blockingOperation: BlockingOperation | null
  setFlasherMode: (mode: FlasherMode) => void
  setBlockingOperation: (operation: BlockingOperation | null) => void
}

// Domain 2: Microcontroller connectivity (ephemeral, never persisted)
export type EspConnectionStatus =
  "disconnected" | "connecting" | "connected" | "disconnecting"

export interface EspSlice {
  // Browser capabilities
  isSupported: boolean
  // Connection lifecycle
  status: EspConnectionStatus
  baudRate: number
  lastError: string | null
  // Hardware references (not serializable, excluded from persist)
  port: SerialPort | null
  portLabel: string | null
  chipName: string | null
  transport: Transport | null
  loader: ESPLoader | null
  // Actions
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setBaudRate: (rate: number) => void
}

// Unified store
export type AppStore = UISlice & EspSlice

// Helper to type slices compatible with the 'persist' middleware
export type AppSliceCreator<T> = StateCreator<
  AppStore,
  [["zustand/persist", unknown]],
  [],
  T
>
