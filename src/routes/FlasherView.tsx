import { useMemo, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import type {
  FlashFreqValues,
  FlashModeValues,
  FlashSizeValues,
} from "esptool-js"
import { FilePlus2, LoaderCircle, Plug, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAppStore } from "@/stores"
import type { FlasherMode } from "@/stores/types"
import { useFileDrop } from "@/hooks/use-file-drop"
import {
  ensureBootloader,
  NotInBootloaderError,
  notifyNotInBootloader,
} from "@/lib/esp/bootloader"
import {
  formatOffset,
  getFlashOffsetDefaults,
  parseOffset,
  suggestOffsetForFile,
} from "@/lib/esp/offsets"
import { describeSerialError } from "@/lib/webserial"

interface FlashFile {
  id: string
  name: string
  size: number
  data: Uint8Array
  offset: string
}

interface FlashProgress {
  fileIndex: number
  written: number
  total: number
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const FLASH_MODES: { value: FlashModeValues; label: string }[] = [
  { value: "keep", label: "Keep" },
  { value: "qio", label: "QIO" },
  { value: "qout", label: "QOUT" },
  { value: "dio", label: "DIO" },
  { value: "dout", label: "DOUT" },
]

const FLASH_FREQS: { value: FlashFreqValues; label: string }[] = [
  { value: "keep", label: "Keep" },
  { value: "40m", label: "40 MHz" },
  { value: "80m", label: "80 MHz" },
  { value: "26m", label: "26 MHz" },
]

const FLASH_SIZES: { value: FlashSizeValues; label: string }[] = [
  { value: "detect", label: "Detect" },
  { value: "keep", label: "Keep" },
  { value: "2MB", label: "2 MB" },
  { value: "4MB", label: "4 MB" },
  { value: "8MB", label: "8 MB" },
  { value: "16MB", label: "16 MB" },
]

export const FlasherView = () => {
  const status = useAppStore((state) => state.status)
  const chipName = useAppStore((state) => state.chipName)
  const transport = useAppStore((state) => state.transport)
  const loader = useAppStore((state) => state.loader)
  const connect = useAppStore((state) => state.connect)
  const flasherMode = useAppStore((state) => state.flasherMode)
  const setFlasherMode = useAppStore((state) => state.setFlasherMode)
  const setBlockingOperation = useAppStore(
    (state) => state.setBlockingOperation
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastReportRef = useRef(0)

  const [files, setFiles] = useState<FlashFile[]>([])
  const [flashMode, setFlashMode] = useState<FlashModeValues>("keep")
  const [flashFreq, setFlashFreq] = useState<FlashFreqValues>("keep")
  const [flashSize, setFlashSize] = useState<FlashSizeValues>("detect")
  const [compress, setCompress] = useState(true)
  const [eraseAll, setEraseAll] = useState(false)
  const [flashing, setFlashing] = useState(false)
  const [progress, setProgress] = useState<FlashProgress | null>(null)

  const isConnected = status === "connected"
  const defaults = useMemo(() => getFlashOffsetDefaults(chipName), [chipName])
  const isAdvanced = flasherMode === "advanced"

  // Going back to «Simple» restores safe options: no full erase and no
  // exotic parameters the user may have left enabled in advanced mode.
  const changeMode = (mode: FlasherMode): void => {
    if (mode === "simple") {
      setFlashMode("keep")
      setFlashFreq("keep")
      setFlashSize("detect")
      setCompress(true)
      setEraseAll(false)
    }
    setFlasherMode(mode)
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const currentFileIndex = progress?.fileIndex ?? 0
  const bytesBefore = files
    .slice(0, currentFileIndex)
    .reduce((sum, file) => sum + file.size, 0)
  const doneBytes = Math.min(totalBytes, bytesBefore + (progress?.written ?? 0))
  const progressPercent = totalBytes > 0 ? (doneBytes / totalBytes) * 100 : 0

  const ingestFiles = async (chosen: File[]): Promise<void> => {
    if (chosen.length === 0) return

    const next: FlashFile[] = []
    for (const file of chosen) {
      const data = new Uint8Array(await file.arrayBuffer())
      next.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: data.byteLength,
        data,
        offset: formatOffset(suggestOffsetForFile(file.name, defaults)),
      })
    }
    setFiles((previous) => [...previous, ...next])
  }

  const addFiles = (event: ChangeEvent<HTMLInputElement>): void => {
    const chosen = Array.from(event.target.files ?? [])
    event.target.value = ""
    void ingestFiles(chosen)
  }

  const { dragActive, dropZone } = useFileDrop({
    onFiles: (chosen) => {
      void ingestFiles(chosen)
    },
    disabled: flashing,
  })

  const removeFile = (id: string): void => {
    setFiles((previous) => previous.filter((file) => file.id !== id))
  }

  const updateOffset = (id: string, offset: string): void => {
    setFiles((previous) =>
      previous.map((file) => (file.id === id ? { ...file, offset } : file))
    )
  }

  const applySuggestedOffsets = (): void => {
    setFiles((previous) =>
      previous.map((file) => ({
        ...file,
        offset: formatOffset(suggestOffsetForFile(file.name, defaults)),
      }))
    )
  }

  const flash = async (): Promise<void> => {
    if (!isConnected || !transport || !loader || files.length === 0) return

    const fileArray: { data: Uint8Array; address: number }[] = []
    for (const file of files) {
      const address = parseOffset(file.offset)
      if (address === null) {
        toast.error("Invalid offset", {
          description: `${file.name}: use a hexadecimal value like 0x10000.`,
        })
        return
      }
      fileArray.push({ data: file.data, address })
    }

    setFlashing(true)
    setProgress(null)
    // Blocks sidebar navigation until the write finishes (or fails).
    setBlockingOperation("flash")

    try {
      await ensureBootloader(loader, transport)

      lastReportRef.current = 0
      await loader.writeFlash({
        fileArray,
        flashMode,
        flashFreq,
        flashSize,
        eraseAll,
        compress,
        reportProgress: (fileIndex, written, total) => {
          const now = performance.now()
          const isLastChunk =
            fileIndex === fileArray.length - 1 && written >= total
          if (!isLastChunk && now - lastReportRef.current < 100) return
          lastReportRef.current = now
          setProgress({ fileIndex, written, total })
        },
      })

      try {
        await loader.after("hard_reset")
      } catch {
        // Native USB: the port can be lost on reset (already warned about
        // in the store's disconnect callback).
      }

      toast.success("Firmware flashed", {
        description: `${fileArray.length} file(s) · ${formatBytes(totalBytes)} written successfully.`,
      })

      if (eraseAll) {
        toast.warning("Flash fully erased", {
          description:
            "RF calibration data was erased: flash a complete firmware and verify the signal.",
        })
      }
    } catch (error) {
      setProgress(null)
      if (error instanceof NotInBootloaderError) {
        notifyNotInBootloader("flash again")
      } else {
        toast.error("Flash failed", {
          description: describeSerialError(error).message,
        })
      }
    } finally {
      setFlashing(false)
      setBlockingOperation(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-border/40 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Flasher
        </h1>
        <p className="text-xs text-muted-foreground">
          Load .bin files into specific memory addresses.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background p-8 text-center shadow-card">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Zap className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">
            Flash Firmware
          </h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {status === "connecting"
              ? "Syncing with the bootloader…"
              : "Connect a device to select .bin files, assign addresses and write to flash."}
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {isAdvanced
                ? "Advanced mode: flash offsets and parameters are editable."
                : "Simple mode: add the .bin files and hit Flash; offsets are suggested automatically."}
            </p>
            <div
              className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 p-0.5"
              role="group"
              aria-label="Flasher mode"
            >
              <Button
                size="sm"
                variant={isAdvanced ? "ghost" : "secondary"}
                aria-pressed={!isAdvanced}
                onClick={() => changeMode("simple")}
                disabled={flashing}
                className="h-7 px-2 text-xs"
              >
                Simple
              </Button>
              <Button
                size="sm"
                variant={isAdvanced ? "secondary" : "ghost"}
                aria-pressed={isAdvanced}
                onClick={() => changeMode("advanced")}
                disabled={flashing}
                className="h-7 px-2 text-xs"
              >
                Advanced
              </Button>
            </div>
          </div>

          <section
            {...dropZone}
            className={cn(
              "relative space-y-3 rounded-lg border p-4 shadow-card",
              dragActive ? "border-primary bg-primary/5" : "border-border/60"
            )}
          >
            {dragActive && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/70 backdrop-blur-[1px]">
                <p className="flex items-center gap-2 rounded-lg border border-dashed border-primary/60 bg-background px-4 py-3 text-xs font-medium text-primary shadow-card">
                  <FilePlus2 className="h-4 w-4" />
                  Drop the .bin files here
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">Files</h2>
                <p className="text-xs text-muted-foreground">
                  {chipName
                    ? `Suggested offsets for ${chipName}: bootloader ${formatOffset(defaults.bootloader)} · partitions ${defaults.partitions !== null ? formatOffset(defaults.partitions) : "—"} · application ${formatOffset(defaults.app)}`
                    : "Default offsets for the classic ESP32; edit them if needed."}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                {isAdvanced && files.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={applySuggestedOffsets}
                    disabled={flashing}
                  >
                    Suggest offsets
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={flashing}
                >
                  <FilePlus2 />
                  Add .bin
                </Button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".bin,.img"
              className="hidden"
              onChange={(event) => {
                addFiles(event)
              }}
            />

            {files.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                No files. Add the bootloader, the partition table and the
                application (or a combined binary), or drag and drop them here.
              </p>
            ) : (
              <ul className="space-y-2">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-2 rounded-lg border border-border/60 p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(file.size)}
                      </p>
                    </div>

                    {isAdvanced ? (
                      <Input
                        value={file.offset}
                        onChange={(event) =>
                          updateOffset(file.id, event.target.value)
                        }
                        className="w-28 font-mono text-xs"
                        placeholder="0x10000"
                        aria-invalid={parseOffset(file.offset) === null}
                        aria-label={`Offset of ${file.name}`}
                        spellCheck={false}
                        disabled={flashing}
                      />
                    ) : (
                      <span
                        className="w-28 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums"
                        title="Automatically suggested offset"
                      >
                        {file.offset}
                      </span>
                    )}

                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeFile(file.id)}
                      disabled={flashing}
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isAdvanced && (
            <section className="space-y-3 rounded-lg border border-border/60 p-4 shadow-card">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Flash mode
                  </span>
                  <Select
                    value={flashMode}
                    onValueChange={(value) => {
                      if (value !== null) setFlashMode(value)
                    }}
                  >
                    <SelectTrigger className="w-full" disabled={flashing}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FLASH_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Frequency
                  </span>
                  <Select
                    value={flashFreq}
                    onValueChange={(value) => {
                      if (value !== null) setFlashFreq(value)
                    }}
                  >
                    <SelectTrigger className="w-full" disabled={flashing}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FLASH_FREQS.map((freq) => (
                        <SelectItem key={freq.value} value={freq.value}>
                          {freq.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Size
                  </span>
                  <Select
                    value={flashSize}
                    onValueChange={(value) => {
                      if (value !== null) setFlashSize(value)
                    }}
                  >
                    <SelectTrigger className="w-full" disabled={flashing}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FLASH_SIZES.map((size) => (
                        <SelectItem key={size.value} value={size.value}>
                          {size.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={compress ? "default" : "outline"}
                  aria-pressed={compress}
                  onClick={() => setCompress((value) => !value)}
                  disabled={flashing}
                  title="Reduces transfer time"
                >
                  Compress
                </Button>

                <Button
                  size="sm"
                  variant={eraseAll ? "destructive" : "outline"}
                  aria-pressed={eraseAll}
                  onClick={() => setEraseAll((value) => !value)}
                  disabled={flashing}
                  title="Erases the whole flash before writing"
                >
                  Erase all before
                </Button>

                {eraseAll && (
                  <p className="text-xs text-destructive">
                    The entire flash will be erased, including RF calibration
                    data.
                  </p>
                )}
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-border/60 p-4 shadow-card">
            {flashing && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-foreground">
                    {currentFileIndex < files.length
                      ? files[currentFileIndex].name
                      : ""}{" "}
                    · {currentFileIndex + 1}/{files.length}
                  </span>
                  <span className="shrink-0 font-medium text-muted-foreground tabular-nums">
                    {progressPercent.toFixed(0)}% · {formatBytes(doneBytes)} /{" "}
                    {formatBytes(totalBytes)}
                  </span>
                </div>
                <Progress value={progressPercent} />
                <p className="text-xs text-muted-foreground">
                  Flashing… do not disconnect the device.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {files.length === 0
                  ? "Add at least one .bin file."
                  : isAdvanced
                    ? `${files.length} file(s) · ${formatBytes(totalBytes)} · ${flashSize === "detect" ? "detected size" : flashSize}`
                    : `${files.length} file(s) · ${formatBytes(totalBytes)}`}
              </p>

              <Button
                onClick={() => {
                  void flash()
                }}
                disabled={flashing || files.length === 0}
              >
                {flashing ? <LoaderCircle className="animate-spin" /> : <Zap />}
                {flashing ? "Flashing" : "Flash"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default FlasherView
