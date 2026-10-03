import { useMemo, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import {
  Combine,
  Download,
  FilePlus2,
  LoaderCircle,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores"
import { useFileDrop } from "@/hooks/use-file-drop"
import {
  formatOffset,
  getFlashOffsetDefaults,
  parseOffset,
  suggestOffsetForFile,
} from "@/lib/esp/offsets"

interface MergeFile {
  id: string
  name: string
  size: number
  data: Uint8Array
  offset: string
}

interface MergeEntry {
  file: MergeFile
  address: number
}

interface MergeResult {
  data: Uint8Array<ArrayBuffer>
  filename: string
  fileCount: number
  sha256: string | null
  createdAt: string
}

// Browsers handle this comfortably; beyond it the offsets are almost surely wrong.
const MAX_MERGED_IMAGE_SIZE = 64 * 1024 * 1024

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const parseOrMax = (offset: string): number =>
  parseOffset(offset) ?? Number.MAX_SAFE_INTEGER

const compareByOffset = (a: MergeFile, b: MergeFile): number =>
  parseOrMax(a.offset) - parseOrMax(b.offset)

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
  const chip = (chipName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return chip ? `merged-${chip}-${stamp}.bin` : `merged-${stamp}.bin`
}

export const GeneratorView = () => {
  const chipName = useAppStore((state) => state.chipName)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<MergeFile[]>([])
  const [merging, setMerging] = useState(false)
  const [result, setResult] = useState<MergeResult | null>(null)

  const defaults = useMemo(() => getFlashOffsetDefaults(chipName), [chipName])

  // Live merge plan: parsed entries sorted by offset, invalid offsets and the
  // first overlap. Pure derivation, recomputed on every file/offset change.
  const plan = useMemo(() => {
    const entries: MergeEntry[] = []
    const invalid: MergeFile[] = []

    for (const file of files) {
      const address = parseOffset(file.offset)
      if (address === null) invalid.push(file)
      else entries.push({ file, address })
    }
    entries.sort((a, b) => a.address - b.address)

    let imageEnd = 0
    for (const entry of entries) {
      imageEnd = Math.max(imageEnd, entry.address + entry.file.size)
    }

    let overlap: string | null = null
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1]
      const previousEnd = previous.address + previous.file.size
      if (previousEnd > entries[index].address) {
        overlap = `${previous.file.name} ends at ${formatOffset(previousEnd)} but ${entries[index].file.name} starts at ${formatOffset(entries[index].address)}.`
        break
      }
    }

    return { entries, invalid, imageEnd, overlap }
  }, [files])

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const hasFileIssues =
    plan.invalid.length > 0 || plan.overlap !== null || files.length === 0
  const isTooLarge = plan.imageEnd > MAX_MERGED_IMAGE_SIZE
  const canGenerate =
    !hasFileIssues && plan.imageEnd > 0 && !isTooLarge && !merging

  const ingestFiles = async (chosen: File[]): Promise<void> => {
    if (chosen.length === 0) return

    const next: MergeFile[] = []
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
    setResult(null)
    setFiles((previous) => [...previous, ...next].sort(compareByOffset))
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
    disabled: merging,
  })

  const removeFile = (id: string): void => {
    setResult(null)
    setFiles((previous) => previous.filter((file) => file.id !== id))
  }

  const updateOffset = (id: string, offset: string): void => {
    setResult(null)
    setFiles((previous) =>
      previous.map((file) => (file.id === id ? { ...file, offset } : file))
    )
  }

  const applySuggestedOffsets = (): void => {
    setResult(null)
    setFiles((previous) =>
      previous
        .map((file) => ({
          ...file,
          offset: formatOffset(suggestOffsetForFile(file.name, defaults)),
        }))
        .sort(compareByOffset)
    )
  }

  const generate = async (): Promise<void> => {
    if (!canGenerate) return

    setMerging(true)
    try {
      // Flash-accurate merge: absolute addresses, unwritten bytes stay 0xFF
      // (the erased-flash state), matching esptool's merge_bin output.
      const image = new Uint8Array(plan.imageEnd)
      image.fill(0xff)
      for (const entry of plan.entries) {
        image.set(entry.file.data, entry.address)
      }

      setResult({
        data: image,
        filename: buildFilename(chipName),
        fileCount: plan.entries.length,
        sha256: await computeSha256(image),
        createdAt: new Date().toLocaleTimeString(),
      })
      toast.success("Image generated", {
        description: `${formatBytes(image.length)} · ${plan.entries.length} file(s) merged.`,
      })
    } catch {
      toast.error("Could not generate the image", {
        description: "Not enough free memory for an image that size.",
      })
    } finally {
      setMerging(false)
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
          Bin Generator
        </h1>
        <p className="text-xs text-muted-foreground">
          Join multiple .bin files into a single combined image. No device
          needed: merging runs locally in your browser.
        </p>
      </div>

      <div className="space-y-4">
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
              {files.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applySuggestedOffsets}
                  disabled={merging}
                >
                  Suggest offsets
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={merging}
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
              application (or any other .bin), or drag and drop them here.
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
                    disabled={merging}
                  />

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => removeFile(file.id)}
                    disabled={merging}
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {plan.invalid.length > 0 && (
            <p className="text-xs text-destructive">
              Invalid offset in {plan.invalid[0].name}. Use a hexadecimal value
              like 0x10000.
            </p>
          )}
          {plan.overlap !== null && (
            <p className="text-xs text-destructive">
              Files overlap: {plan.overlap}
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-border/60 p-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Merged image
              </h2>
              <p className="text-xs text-muted-foreground">
                {files.length === 0
                  ? "Add at least one .bin file."
                  : hasFileIssues
                    ? "Fix the file issues above to continue."
                    : isTooLarge
                      ? `The image would be ${formatBytes(plan.imageEnd)}, over the ${formatBytes(MAX_MERGED_IMAGE_SIZE)} limit. Adjust the offsets.`
                      : `${files.length} file(s) · ${formatBytes(totalBytes)} of data → ${formatBytes(plan.imageEnd)} image (0x0 – ${formatOffset(plan.imageEnd)})`}
              </p>
            </div>

            <Button
              onClick={() => {
                void generate()
              }}
              disabled={!canGenerate}
            >
              {merging ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Combine />
              )}
              {merging ? "Generating…" : "Generate image"}
            </Button>
          </div>
        </section>

        {result !== null && (
          <section className="space-y-3 rounded-lg border border-border/60 p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="truncate text-sm font-semibold text-foreground">
                  {result.filename}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(result.data.length)} · {result.fileCount} file(s)
                  · {result.createdAt}
                </p>
                {result.sha256 !== null && (
                  <p
                    className="font-mono text-xs break-all text-muted-foreground"
                    title="SHA-256 of the merged image"
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
    </div>
  )
}

export default GeneratorView
