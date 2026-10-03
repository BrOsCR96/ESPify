import type { Transport } from "esptool-js"
import { toast } from "sonner"
import type {
  AppSliceCreator,
  EspConnectionStatus,
  EspSlice,
} from "@/stores/types"
import { espLoaderTerminal } from "@/lib/esp/terminal"
import {
  DEFAULT_BAUD_RATE,
  describeConnectFailure,
  describePort,
  describeSerialError,
  isWebSerialSupported,
} from "@/lib/webserial"

// Sole global subscriber to navigator.serial `disconnect` events.
// Cleared on connect/disconnect to avoid orphaned listeners.
let detachDisconnectListener: (() => void) | null = null

const releaseDisconnectListener = (): void => {
  detachDisconnectListener?.()
  detachDisconnectListener = null
}

export const createEspSlice: AppSliceCreator<EspSlice> = (set, get) => {
  const clearConnection = (
    status: EspConnectionStatus,
    lastError: string | null = null
  ): void => {
    releaseDisconnectListener()
    set({
      status,
      lastError,
      port: null,
      portLabel: null,
      chipName: null,
      transport: null,
      loader: null,
    })
  }

  const handleDeviceLost = (message: string): void => {
    if (get().status === "disconnected") return

    get().transport?.setDeviceLostCallback(null)
    clearConnection("disconnected", message)
    toast.error("Device disconnected", { description: message })
  }

  const connect = async (): Promise<void> => {
    const { status, baudRate } = get()
    if (status !== "disconnected") return

    if (!isWebSerialSupported()) {
      toast.error("WebSerial not available", {
        description:
          "Use Chrome, Edge or Opera on desktop with HTTPS or localhost.",
      })
      return
    }

    set({ status: "connecting", lastError: null })

    let transport: Transport | null = null
    let port: SerialPort | null = null

    try {
      port = await navigator.serial.requestPort()
      // Deferred load: esptool-js only joins the bundle when connecting.
      const { ESPLoader, Transport } = await import("esptool-js")
      transport = new Transport(port, false)

      const loader = new ESPLoader({
        transport,
        baudrate: baudRate,
        terminal: espLoaderTerminal,
      })

      const chipName = await loader.main()
      const portLabel = describePort(port)

      const onSerialDisconnect = (event: Event): void => {
        if (event.target !== port) return
        handleDeviceLost("The device was physically unplugged.")
      }

      navigator.serial.addEventListener("disconnect", onSerialDisconnect)
      detachDisconnectListener = () => {
        navigator.serial.removeEventListener("disconnect", onSerialDisconnect)
      }

      transport.setDeviceLostCallback(() => {
        handleDeviceLost("Communication with the device was lost.")
      })

      set({
        status: "connected",
        port,
        portLabel,
        chipName,
        transport,
        loader,
      })

      toast.success("Device connected", {
        description: `${chipName} · ${portLabel} · ${baudRate} baud`,
      })
    } catch (error) {
      const info = describeConnectFailure(error, port)

      releaseDisconnectListener()
      try {
        await transport?.disconnect()
      } catch {
        // The port never opened: nothing to close.
      }

      clearConnection(
        "disconnected",
        info.kind === "cancelled" ? null : info.message
      )

      if (info.kind === "cancelled") {
        toast.info(info.message)
      } else {
        toast.error("Could not connect", { description: info.message })
      }
    }
  }

  const disconnect = async (): Promise<void> => {
    const { status, transport } = get()
    if (status !== "connected") return

    set({ status: "disconnecting" })
    transport?.setDeviceLostCallback(null)

    let failure: string | null = null
    try {
      await transport?.disconnect()
    } catch (error) {
      failure = describeSerialError(error).message
    }

    if (failure !== null) {
      clearConnection("disconnected", failure)
      toast.error("Could not close the port", { description: failure })
      return
    }

    clearConnection("disconnected")
    toast.success("Device disconnected")
  }

  const setBaudRate = (rate: number): void => {
    if (get().status !== "disconnected") return
    set({ baudRate: rate })
  }

  return {
    isSupported: isWebSerialSupported(),
    status: "disconnected",
    baudRate: DEFAULT_BAUD_RATE,
    lastError: null,
    port: null,
    portLabel: null,
    chipName: null,
    transport: null,
    loader: null,
    connect,
    disconnect,
    setBaudRate,
  }
}
