import type { ESPLoader, Transport } from "esptool-js"
import { toast } from "sonner"
import { useAppStore } from "@/stores"
import { ensureLoaderRead } from "@/lib/esp/monitor"

/** The chip does not respond in the ROM bootloader (probably running firmware). */
export class NotInBootloaderError extends Error {
  constructor(message = "The device does not respond in bootloader mode") {
    super(message)
    this.name = "NotInBootloaderError"
  }
}

/**
 * Prepares the channel to operate on flash: hands the stream back to the
 * esptool readLoop and quickly checks that the chip is still in the
 * bootloader (after a hard_reset the firmware is already running and any
 * loader operation would hang or fail).
 */
export const ensureBootloader = async (
  loader: ESPLoader,
  transport: Transport
): Promise<void> => {
  await ensureLoaderRead(transport)
  try {
    await loader.readReg(loader.CHIP_DETECT_MAGIC_REG_ADDR, 500)
  } catch {
    transport.flushInput()
    throw new NotInBootloaderError()
  }
}

const reconnect = async (): Promise<void> => {
  const { status, disconnect, connect } = useAppStore.getState()
  if (status === "connected") await disconnect()
  await connect()
}

/** Standard toast shown when the chip is not in bootloader mode. */
export const notifyNotInBootloader = (context: string): void => {
  toast.error("The device is not in bootloader mode", {
    description: `The firmware may already be running. Reconnect to ${context}.`,
    action: {
      label: "Reconnect",
      onClick: () => {
        void reconnect()
      },
    },
  })
}
