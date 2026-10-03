export const BAUD_RATES = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000, 1500000,
  2000000,
] as const

export const DEFAULT_BAUD_RATE = 115200

export const MIN_BAUD_RATE = 1
export const MAX_BAUD_RATE = 12_000_000

export type SerialErrorKind =
  "cancelled" | "blocked" | "unsupported" | "unknown"

export interface SerialErrorInfo {
  kind: SerialErrorKind
  message: string
}

export const isWebSerialSupported = (): boolean => "serial" in navigator

const hexId = (value: number): string =>
  `0x${value.toString(16).toUpperCase().padStart(4, "0")}`

/**
 * Identifies the active port from its USB descriptors. Adapters without a
 * VID (virtual ports) return a generic name.
 */
export const describePort = (port: SerialPort): string => {
  const { usbVendorId, usbProductId } = port.getInfo()

  if (usbVendorId === undefined) return "Serial port"
  if (usbProductId === undefined) return hexId(usbVendorId)

  return `${hexId(usbVendorId)}:${hexId(usbProductId)}`
}

/**
 * Translates WebSerial (and esptool-js) exceptions into actionable messages
 * for the user.
 */
export const describeSerialError = (error: unknown): SerialErrorInfo => {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotFoundError":
        return { kind: "cancelled", message: "Port selection cancelled." }
      case "AbortError":
        return { kind: "cancelled", message: "Port selection aborted." }
      case "InvalidStateError":
        return {
          kind: "blocked",
          message: "Port busy. This port is already open in the browser.",
        }
      case "NetworkError":
        if (/device has been lost/i.test(error.message)) {
          return {
            kind: "unknown",
            message: "The device was disconnected from the serial port.",
          }
        }
        return {
          kind: "blocked",
          message:
            "Port busy. Close other tabs or programs using the serial port.",
        }
      case "NotAllowedError":
        return { kind: "blocked", message: "Access permission denied." }
      case "SecurityError":
        return {
          kind: "unsupported",
          message: "WebSerial requires HTTPS or localhost.",
        }
      default:
        break
    }
  }

  return {
    kind: "unknown",
    message:
      error instanceof Error && error.message
        ? error.message
        : "Unknown error while communicating with the device.",
  }
}

// Espressif VID: native USB ports (ESP32-S2/S3/C3/C6...).
const ESPRESSIF_NATIVE_USB_VID = 0x303a

/**
 * Translates bootloader sync failures, adding the usual hints: hold the BOOT
 * button and native USB issues.
 */
export const describeConnectFailure = (
  error: unknown,
  port?: SerialPort | null
): SerialErrorInfo => {
  const info = describeSerialError(error)
  if (info.kind !== "unknown") return info

  const hints: string[] = []
  const message = error instanceof Error ? error.message : ""

  if (
    /failed to connect|failed to detect|failed to autodetect/i.test(message)
  ) {
    hints.push(
      "Hold the BOOT button while connecting and release it once the chip is detected."
    )
  }

  const usbVendorId = port ? port.getInfo().usbVendorId : undefined
  if (usbVendorId === ESPRESSIF_NATIVE_USB_VID) {
    hints.push(
      "This chip uses native USB (ESP32-S3/C3...): if the port disappears on reset, replug the USB cable and try again."
    )
  }

  if (hints.length === 0) return info
  return { kind: info.kind, message: `${info.message} ${hints.join(" ")}` }
}

/**
 * Writes raw bytes to the port (no SLIP encoding, unlike `Transport.write`).
 * This is what the console uses to send commands to the firmware.
 */
export const writePortRaw = async (
  port: SerialPort,
  data: Uint8Array
): Promise<void> => {
  if (!port.writable) {
    throw new DOMException("The port is not open.", "InvalidStateError")
  }
  const writer = port.writable.getWriter()
  try {
    await writer.write(data)
  } finally {
    writer.releaseLock()
  }
}
