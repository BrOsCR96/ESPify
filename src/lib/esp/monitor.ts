import type { Transport } from "esptool-js"

export type SerialMonitorListener = (chunk: Uint8Array) => void

/**
 * Access to `Transport` internal fields that esptool-js does not expose in
 * its public API: the active reader (loader readLoop) and the input buffer.
 */
interface TransportInternals {
  reader?: ReadableStreamDefaultReader<Uint8Array>
  buffer?: Uint8Array
}

const internals = (transport: Transport): TransportInternals =>
  transport as unknown as TransportInternals

const listeners = new Set<SerialMonitorListener>()

// All operations are serialized into a single queue: the port stream can
// only have one owner at a time (loader readLoop XOR monitor).
let queue: Promise<void> = Promise.resolve()
let activeTransport: Transport | null = null
let readPromise: Promise<void> | null = null
let closed = true
let suspendedFor: Transport | null = null

const enqueue = (operation: () => Promise<void>): Promise<void> => {
  const next = queue.then(operation)
  queue = next.catch(() => undefined)
  return next
}

const emit = (chunk: Uint8Array): void => {
  if (chunk.length === 0) return
  listeners.forEach((listener) => listener(chunk))
}

const cancelCurrentReader = async (transport: Transport): Promise<void> => {
  const reader = internals(transport).reader
  if (!reader) return
  try {
    await reader.cancel()
  } catch {
    // The reader was already released by a previous operation.
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })

const stopActiveMonitor = async (): Promise<void> => {
  const transport = activeTransport
  const pending = readPromise
  closed = true
  activeTransport = null
  readPromise = null
  if (transport) await cancelCurrentReader(transport)
  if (pending) {
    try {
      await pending
    } catch {
      // rawRead captures its own read errors.
    }
  }
}

const startMonitor = async (transport: Transport): Promise<void> => {
  if (activeTransport === transport && readPromise) return
  if (activeTransport) await stopActiveMonitor()

  // The readLoop started by esptool keeps the stream locked:
  // it must be handed back to the monitor before reading.
  await cancelCurrentReader(transport)
  suspendedFor = transport

  // Drain what the loader accumulated in its buffer so no logs are lost.
  const buffered = internals(transport).buffer
  if (buffered && buffered.length > 0) {
    internals(transport).buffer = new Uint8Array(0)
    emit(buffered)
  }

  closed = false
  activeTransport = transport
  const stream = transport.rawRead(
    (chunk) => {
      if (!closed) emit(chunk)
    },
    () => closed
  )
  readPromise = stream.finally(() => {
    if (activeTransport === transport) {
      activeTransport = null
      readPromise = null
    }
  })
}

const restoreLoaderRead = async (transport: Transport): Promise<void> => {
  if (activeTransport === transport) await stopActiveMonitor()
  if (suspendedFor !== transport) return
  suspendedFor = null

  if (!transport.device.readable) return

  const isLocked = (): boolean => transport.device.readable?.locked === true
  const canReadLoop = (): boolean => {
    const readable = transport.device.readable
    return readable !== null && !readable.locked
  }

  // Wait for any leftover reader to release the stream (max ~1 s).
  for (let attempt = 0; attempt < 25 && isLocked(); attempt += 1) {
    if (attempt === 15) await cancelCurrentReader(transport)
    await sleep(40)
  }
  if (isLocked()) {
    await cancelCurrentReader(transport)
    await sleep(100)
  }
  if (canReadLoop()) {
    void transport.readLoop()
  }
}

/**
 * Subscribes a consumer (e.g. xterm) to the raw serial stream.
 * Returns the unsubscribe function.
 */
export const subscribeSerialMonitor = (
  listener: SerialMonitorListener
): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** true when the monitor is reading the port stream. */
export const isSerialMonitorActive = (): boolean => readPromise !== null

/**
 * Takes the port stream for the monitor (cancelling the loader readLoop).
 * `isStillActive` allows cancelling the operation if the component that
 * requested it has already unmounted (StrictMode / fast navigation).
 */
export const startSerialMonitor = (
  transport: Transport,
  isStillActive?: () => boolean
): Promise<void> =>
  enqueue(async () => {
    await startMonitor(transport)
    if (isStillActive && !isStillActive()) await stopActiveMonitor()
  })

/** Hands the stream back to the loader (no-op if the monitor was not active). */
export const stopSerialMonitor = (): Promise<void> => enqueue(stopActiveMonitor)

/**
 * Ensures the esptool readLoop is running before running a loader operation
 * (writeFlash, eraseFlash, readFlash, reset...). Every view that invokes the
 * loader MUST call this first.
 */
export const ensureLoaderRead = (transport: Transport): Promise<void> =>
  enqueue(() => restoreLoaderRead(transport))
