import { useRef, useState } from "react"
import { Download, HardDriveDownload, LoaderCircle, Plug } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { useAppStore } from "@/stores"
import {
  ensureBootloader,
  NotInBootloaderError,
  notifyNotInBootloader,
} from "@/lib/esp/bootloader"
import { formatOffset, parseOffset } from "@/lib/esp/offsets"
import { describeSerialError } from "@/lib/webserial"

interface BackupResult {
  data: Uint8Array<ArrayBuffer>
  filename: string
  offset: number
  sha256: string | null
  readAt: string
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** "4MB" / "256KB" (esptool DETECTED_FLASH_SIZES) → bytes. */
const parseFlashSize = (value: string | undefined): number | null => {
  if (value === undefined) return null
  const megabytes = /^(\d+)MB$/.exec(value)
  if (megabytes) return Number(megabytes[1]) * 1024 * 1024
  const kilobytes = /^(\d+)KB$/.exec(value)
  if (kilobytes) return Number(kilobytes[1]) * 1024
  return null
}

const computeSha256 = async (
  data: Uint8Array<ArrayBuffer>
): Promise<string | null> => {
  try {
    const digest = await crypto.subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
  } catch {
    return null
  }
}

const buildFilename = (chipName: string | null): string => {
  const chip = (chipName ?? "esp")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return `backup-${chip || "esp"}-${stamp}.bin`
}

export const BackupView = () => {
  const status = useAppStore((state) => state.status)
  const chipName = useAppStore((state) => state.chipName)
  const transport = useAppStore((state) => state.transport)
  const loader = useAppStore((state) => state.loader)
  const connect = useAppStore((state) => state.connect)
  const setBlockingOperation = useAppStore(
    (state) => state.setBlockingOperation
  )

  const lastReportRef = useRef(0)

  const [offsetInput, setOffsetInput] = useState("0x0")
  const [sizeInput, setSizeInput] = useState("")
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState<{
    read: number
    total: number
  } | null>(null)
  const [result, setResult] = useState<BackupResult | null>(null)

  const isConnected = status === "connected"
  const offsetValid = parseOffset(offsetInput) !== null
  const sizeValid = sizeInput.trim() === "" || parseOffset(sizeInput) !== null
  const progressPercent =
    progress !== null && progress.total > 0
      ? (progress.read / progress.total) * 100
      : 0

  const readBackup = async (): Promise<void> => {
    if (!isConnected || !transport || !loader) return

    const offset = parseOffset(offsetInput)
    if (offset === null) {
      toast.error("Invalid offset", {
        description: "Use a hexadecimal value like 0x0.",
      })
      return
    }

    let size: number | null = null
    if (sizeInput.trim() !== "") {
      size = parseOffset(sizeInput)
      if (size === null) {
        toast.error("Invalid size", {
          description:
            "Use hexadecimal (0x400000) or decimal; leave it empty to detect it.",
        })
        return
      }
    }

    setReading(true)
    setProgress(null)
    // Blocks sidebar navigation until the read finishes (or fails).
    setBlockingOperation("backup")

    try {
      await ensureBootloader(loader, transport)

      if (size === null) {
        const total = parseFlashSize(await loader.detectFlashSize())
        if (total === null) {
          toast.error("Could not detect the flash", {
            description: "Enter the size manually in the Size field.",
          })
          return
        }
        size = total - offset
        if (size <= 0) {
          toast.error("Offset out of range", {
            description: `The offset exceeds the flash size (${formatBytes(total)}).`,
          })
          return
        }
      }

      lastReportRef.current = 0
      const raw = await loader.readFlash(
        offset,
        size,
        (_packet, read, total) => {
          const now = performance.now()
          if (read >= total || now - lastReportRef.current >= 100) {
            lastReportRef.current = now
            setProgress({ read, total })
          }
        }
      )
      // Copy into a dedicated ArrayBuffer: the slice returned by readFlash may
      // exceed `size` and its type does not guarantee ArrayBuffer (Blob/SHA-256).
      const data = new Uint8Array(raw.subarray(0, size))

      if (useAppStore.getState().status !== "connected") return

      setResult({
        data,
        filename: buildFilename(chipName),
        offset,
        sha256: await computeSha256(data),
        readAt: new Date().toLocaleTimeString(),
      })
      setProgress(null)
      toast.success("Backup created", {
        description: `${formatBytes(data.length)} read from ${formatOffset(offset)}.`,
      })
    } catch (error) {
      setProgress(null)
      if (error instanceof NotInBootloaderError) {
        notifyNotInBootloader("read the flash")
      } else {
        toast.error("Could not read the flash", {
          description: describeSerialError(error).message,
        })
      }
    } finally {
      setReading(false)
      setBlockingOperation(null)
    }
  }

  const download = (): void => {
    if (!result) return
    const blob = new Blob([result.data], { type: "application/octet-stream" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = result.filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-border/40 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Backup
        </h1>
        <p className="text-xs text-muted-foreground">
          Download the full flash memory as a .bin file.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background p-8 text-center shadow-card">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <HardDriveDownload className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">
            Memory Backup
          </h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {status === "connecting"
              ? "Syncing with the bootloader…"
              : "Connect a device to read its flash and download a .bin backup."}
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">
                  Create backup
                </h2>
                <p className="text-xs text-muted-foreground">
                  Read a flash range and generate a downloadable .bin.
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  void readBackup()
                }}
                disabled={reading || !offsetValid || !sizeValid}
              >
                {reading ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <HardDriveDownload />
                )}
                {reading ? "Reading…" : "Create backup"}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Start offset
                </span>
                <Input
                  value={offsetInput}
                  onChange={(event) => setOffsetInput(event.target.value)}
                  className="font-mono text-xs"
                  placeholder="0x0"
                  aria-invalid={!offsetValid}
                  aria-label="Start offset"
                  spellCheck={false}
                  disabled={reading}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Size
                </span>
                <Input
                  value={sizeInput}
                  onChange={(event) => setSizeInput(event.target.value)}
                  className="font-mono text-xs"
                  placeholder="Detect automatically"
                  aria-invalid={!sizeValid}
                  aria-label="Size to read"
                  spellCheck={false}
                  disabled={reading}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Leave it empty to read from the offset to the end of the flash. Do
              not disconnect the device during the read.
            </p>

            {reading && progress !== null && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-foreground">
                    Reading flash…
                  </span>
                  <span className="shrink-0 font-medium text-muted-foreground tabular-nums">
                    {progressPercent.toFixed(0)}% · {formatBytes(progress.read)}{" "}
                    / {formatBytes(progress.total)}
                  </span>
                </div>
                <Progress value={progressPercent} />
              </div>
            )}
          </section>

          {result !== null && (
            <section className="space-y-3 rounded-lg border border-border/60 p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {result.filename}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(result.data.length)} · offset{" "}
                    {formatOffset(result.offset)} · {result.readAt}
                  </p>
                  {result.sha256 !== null && (
                    <p
                      className="font-mono text-xs break-all text-muted-foreground"
                      title="SHA-256 of the backup"
                    >
                      SHA-256: {result.sha256}
                    </p>
                  )}
                </div>

                <Button size="sm" onClick={download}>
                  <Download />
                  Download .bin
                </Button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export default BackupView
