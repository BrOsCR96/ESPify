import { useEffect, useState } from "react"
import { AlertTriangle, LoaderCircle, Plug, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/stores"
import {
  ensureBootloader,
  NotInBootloaderError,
  notifyNotInBootloader,
} from "@/lib/esp/bootloader"
import { ensureLoaderRead } from "@/lib/esp/monitor"
import { describeSerialError } from "@/lib/webserial"

export const ResetView = () => {
  const status = useAppStore((state) => state.status)
  const transport = useAppStore((state) => state.transport)
  const loader = useAppStore((state) => state.loader)
  const connect = useAppStore((state) => state.connect)
  const setBlockingOperation = useAppStore(
    (state) => state.setBlockingOperation
  )

  const [restarting, setRestarting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const isConnected = status === "connected"
  const busy = restarting || erasing

  // eraseFlash is a single ROM command with no progress callback: the only
  // honest feedback is elapsed time while it runs.
  useEffect(() => {
    if (!erasing) return
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - startedAt) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [erasing])

  const restart = async (): Promise<void> => {
    if (!isConnected || !transport || !loader || busy) return

    setRestarting(true)
    try {
      // Reset commands (and usesUsbOtg) need the loader readLoop.
      await ensureLoaderRead(transport)
      await loader.after("hard_reset")
      toast.success("Device restarted", {
        description: "The chip is booting the flashed firmware again.",
      })
    } catch (error) {
      toast.error("Could not restart the device", {
        description: describeSerialError(error).message,
      })
    } finally {
      setRestarting(false)
    }
  }

  const erase = async (): Promise<void> => {
    if (!isConnected || !transport || !loader || busy) return

    setErasing(true)
    setElapsed(0)
    // Blocks sidebar navigation until the erase finishes (or fails).
    setBlockingOperation("erase")

    try {
      await ensureBootloader(loader, transport)
      await loader.eraseFlash()
      setConfirming(false)
      setAcknowledged(false)
      toast.success("Flash erased", {
        description:
          "The chip stays in bootloader mode: use the Flasher view to write a new firmware.",
      })
    } catch (error) {
      if (error instanceof NotInBootloaderError) {
        notifyNotInBootloader("erase the flash")
      } else {
        toast.error("Erase failed", {
          description: describeSerialError(error).message,
        })
      }
    } finally {
      setErasing(false)
      setBlockingOperation(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-border/40 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Reset
        </h1>
        <p className="text-xs text-muted-foreground">
          Restart the device or erase the entire flash to restore it to its
          factory state.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background p-8 text-center shadow-card">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <RotateCcw className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">
            Factory Reset
          </h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {status === "connecting"
              ? "Syncing with the bootloader…"
              : "Connect a device to restart it or wipe its flash completely."}
          </p>
          {status === "connecting" ? (
            <LoaderCircle className="mt-4 h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="mt-4 flex flex-col items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void connect()
                }}
              >
                <Plug />
                Connect
              </Button>
              <p className="max-w-sm text-xs text-muted-foreground">
                If the connection fails, hold the BOOT button while connecting.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <section className="space-y-3 rounded-lg border border-border/60 p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">
                  Restart device
                </h2>
                <p className="text-xs text-muted-foreground">
                  Reboots the chip so the flashed firmware runs again. Any
                  unsaved state in RAM is lost.
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void restart()
                }}
                disabled={busy}
              >
                {restarting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                {restarting ? "Restarting…" : "Restart"}
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Erase entire flash
                </h2>
                <p className="text-xs text-muted-foreground">
                  Runs erase_flash over the whole chip, including the partition
                  table and the RF calibration data. The device will not boot
                  again until you flash a new firmware.
                </p>
              </div>

              {!confirming && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                >
                  Erase flash
                </Button>
              )}
            </div>

            {confirming && (
              <div className="space-y-3 rounded-lg border border-destructive/40 bg-background/60 p-3">
                <p className="text-xs font-medium text-destructive">
                  This erases every byte of flash. After erasing, flash a
                  complete firmware and verify the Wi-Fi/Bluetooth signal, since
                  the calibration data is gone.
                </p>

                <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    disabled={erasing}
                    className="mt-0.5 size-4 shrink-0 accent-destructive"
                  />
                  I understand that this action cannot be undone.
                </label>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      void erase()
                    }}
                    disabled={!acknowledged || busy}
                  >
                    {erasing ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <AlertTriangle />
                    )}
                    {erasing ? "Erasing…" : "Erase everything"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setConfirming(false)
                      setAcknowledged(false)
                    }}
                    disabled={erasing}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {erasing && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-foreground">
                    Erasing flash…
                  </span>
                  <span className="shrink-0 font-medium text-muted-foreground tabular-nums">
                    {elapsed}s
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Erasing flash"
                  className="h-2 w-full overflow-hidden rounded-full bg-primary/15"
                >
                  <div className="h-full w-full animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Do not disconnect the device or close this tab.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default ResetView
