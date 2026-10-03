import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal as XTerm } from "@xterm/xterm"
import type { ITheme } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import {
  Download,
  Eraser,
  LoaderCircle,
  Pause,
  Play,
  Plug,
  RefreshCw,
  Send,
  Terminal,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAppStore } from "@/stores"
import { useThemeStore } from "@/stores/use-theme-store"
import {
  ensureLoaderRead,
  startSerialMonitor,
  stopSerialMonitor,
  subscribeSerialMonitor,
} from "@/lib/esp/monitor"
import { subscribeEspTerminal } from "@/lib/esp/terminal"
import { describeSerialError, writePortRaw } from "@/lib/webserial"
import { cn } from "@/lib/utils"

const MONO_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace'

const DARK_THEME: ITheme = {
  background: "#0a0a0a",
  foreground: "#ededed",
  cursor: "#ededed",
  cursorAccent: "#0a0a0a",
  selectionBackground: "#404040",
  black: "#171717",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#d4d4d4",
  brightBlack: "#737373",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#fafafa",
}

const LIGHT_THEME: ITheme = {
  background: "#ffffff",
  foreground: "#171717",
  cursor: "#171717",
  cursorAccent: "#ffffff",
  selectionBackground: "#d4d4d4",
  black: "#171717",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#e5e5e5",
  brightBlack: "#737373",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#fafafa",
}

type LineEnding = "crlf" | "lf" | "none"

const LINE_ENDINGS: Record<LineEnding, string> = {
  crlf: "\r\n",
  lf: "\n",
  none: "",
}

const MAX_HISTORY = 50

export const ConsoleView = () => {
  const isSupported = useAppStore((state) => state.isSupported)
  const status = useAppStore((state) => state.status)
  const port = useAppStore((state) => state.port)
  const transport = useAppStore((state) => state.transport)
  const loader = useAppStore((state) => state.loader)
  const chipName = useAppStore((state) => state.chipName)
  const portLabel = useAppStore((state) => state.portLabel)
  const baudRate = useAppStore((state) => state.baudRate)
  const connect = useAppStore((state) => state.connect)
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme)

  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(0)
  const mountedRef = useRef(true)

  const [monitorOn, setMonitorOn] = useState(true)
  const [lineEnding, setLineEnding] = useState<LineEnding>("crlf")
  const [draft, setDraft] = useState("")
  const [resetting, setResetting] = useState(false)

  const isConnected = status === "connected"

  // xterm lives in a ref: serial stream chunks never go through useState
  // (ESP devices saturate the event loop at 115200 baud).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    mountedRef.current = true
    const initialTheme =
      useThemeStore.getState().resolvedTheme === "dark"
        ? DARK_THEME
        : LIGHT_THEME
    const term = new XTerm({
      convertEol: false,
      disableStdin: true,
      fontSize: 12,
      fontFamily: MONO_FONT,
      scrollback: 5000,
      cursorBlink: false,
      theme: initialTheme,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    termRef.current = term

    try {
      fit.fit()
    } catch {
      // No dimensions yet: the ResizeObserver will retry.
    }

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // Container hidden (overlay): ignored.
      }
    })
    observer.observe(container)

    return () => {
      mountedRef.current = false
      observer.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = resolvedTheme === "dark" ? DARK_THEME : LIGHT_THEME
  }, [resolvedTheme])

  // ESPLoader output (connection, flashing) + raw port stream into xterm,
  // which interprets the ANSI codes of ESP-IDF logs.
  useEffect(() => {
    const term = termRef.current
    if (!term) return

    const decoder = new TextDecoder()
    const offLoader = subscribeEspTerminal((event) => {
      if (event.type === "clean") return
      const text =
        event.type === "line" && !event.data.endsWith("\n")
          ? `${event.data}\r\n`
          : event.data
      term.write(text)
    })
    const offSerial = subscribeSerialMonitor((chunk) => {
      term.write(decoder.decode(chunk, { stream: true }))
    })

    return () => {
      offLoader()
      offSerial()
    }
  }, [])

  // The monitor takes the stream only while this view is mounted and
  // connected; on unmount the stream returns to the loader (Flasher/Inspector).
  useEffect(() => {
    if (status !== "connected" || !monitorOn || !transport) return

    let active = true
    void startSerialMonitor(transport, () => active).catch(() => undefined)

    return () => {
      active = false
      void stopSerialMonitor().catch(() => undefined)
    }
  }, [status, monitorOn, transport])

  const send = async (): Promise<void> => {
    const command = draft.trim()
    if (!isConnected || !port || command === "") return

    try {
      await writePortRaw(
        port,
        new TextEncoder().encode(command + LINE_ENDINGS[lineEnding])
      )
      termRef.current?.write(`\r\n\x1b[2m❯ ${command}\x1b[0m\r\n`)

      const history = historyRef.current
      if (history[history.length - 1] !== command) history.push(command)
      if (history.length > MAX_HISTORY)
        history.splice(0, history.length - MAX_HISTORY)
      historyIndexRef.current = history.length

      setDraft("")
    } catch (error) {
      toast.error("Could not send the command", {
        description: describeSerialError(error).message,
      })
    }
  }

  const resetDevice = async (): Promise<void> => {
    if (!isConnected || !transport || !loader) return

    setResetting(true)
    try {
      // Reset commands (and usesUsbOtg) need the loader readLoop.
      await ensureLoaderRead(transport)
      await loader.after("hard_reset")
      termRef.current?.write(
        "\r\n\x1b[2m[system] Device reset, booting firmware…\x1b[0m\r\n"
      )
    } catch (error) {
      toast.error("Could not reset the device", {
        description: describeSerialError(error).message,
      })
    } finally {
      setResetting(false)
      if (monitorOn && mountedRef.current) {
        void startSerialMonitor(transport).catch(() => undefined)
      }
    }
  }

  // Reads the xterm buffer (the single source of truth for the log: same
  // rows the user sees, ANSI already resolved to plain text) and saves them
  // as a .txt file. Wrapped rows are re-joined into their logical line.
  const exportLog = (): void => {
    const term = termRef.current
    if (!term) return

    const buffer = term.buffer.active
    const lines: string[] = []
    for (let index = 0; index < buffer.length; index += 1) {
      const line = buffer.getLine(index)
      if (line === undefined) continue
      const text = line.translateToString(true)
      if (line.isWrapped && lines.length > 0) {
        lines[lines.length - 1] += text
      } else {
        lines.push(text)
      }
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()

    if (lines.length === 0) {
      toast.info("The console log is empty")
      return
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
    const chip = (chipName ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    const filename = chip
      ? `console-${chip}-${stamp}.txt`
      : `console-${stamp}.txt`
    const header = [
      "ESPify console log",
      `Chip: ${chipName ?? "unknown"} · Port: ${portLabel ?? "—"} · Baud: ${baudRate}`,
      `Exported: ${new Date().toISOString()}`,
      "-".repeat(64),
    ]
    const content = `${header.join("\n")}\n${lines.join("\n")}\n`

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)

    toast.success("Log exported", {
      description: `${lines.length} line(s) · ${filename}`,
    })
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const history = historyRef.current

    if (event.key === "Enter") {
      event.preventDefault()
      void send()
      return
    }

    if (event.key === "ArrowUp" && history.length > 0) {
      event.preventDefault()
      const next = Math.max(0, historyIndexRef.current - 1)
      historyIndexRef.current = next
      setDraft(history[next])
      return
    }

    if (event.key === "ArrowDown" && historyIndexRef.current < history.length) {
      event.preventDefault()
      const next = historyIndexRef.current + 1
      historyIndexRef.current = next
      setDraft(next >= history.length ? "" : history[next])
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-border/40 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Console
        </h1>
        <p className="text-xs text-muted-foreground">
          View serial logs and send commands to the device.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={monitorOn ? "outline" : "default"}
          onClick={() => setMonitorOn((value) => !value)}
          disabled={!isConnected}
          title={
            monitorOn
              ? "Stop reading the port (incoming output is discarded)"
              : "Resume reading the serial port"
          }
        >
          {monitorOn ? <Pause /> : <Play />}
          {monitorOn ? "Pause monitor" : "Start monitor"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => termRef.current?.clear()}
          disabled={!isConnected}
        >
          <Eraser />
          Clear
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void resetDevice()
          }}
          disabled={!isConnected || resetting}
          title="Reset via DTR/RTS to boot the firmware"
        >
          <RefreshCw className={cn(resetting && "animate-spin")} />
          Reset
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={exportLog}
          title="Save the console log as a .txt file"
        >
          <Download />
          Export .txt
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary">{chipName ?? "No chip"}</Badge>
          <Badge variant="outline">{baudRate} baud</Badge>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-border/60 bg-background shadow-card">
        <div ref={containerRef} className="h-[45vh] min-h-[320px] w-full p-2" />

        {status !== "connected" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/95 p-8 text-center backdrop-blur-sm">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Terminal className="h-6 w-6" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">
              Terminal Serial
            </h2>

            {!isSupported ? (
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Your browser does not support WebSerial. Use Chrome, Edge or
                Opera on desktop with HTTPS or localhost.
              </p>
            ) : status === "connecting" ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Syncing with the bootloader…
              </div>
            ) : (
              <>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  Connect a device to see logs in real time and send commands.
                </p>
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    void connect()
                  }}
                >
                  <Plug />
                  Connect
                </Button>
                <p className="mt-2 max-w-sm text-xs text-muted-foreground">
                  If the connection fails, hold the BOOT button while
                  connecting.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Select
          value={lineEnding}
          onValueChange={(value) => {
            if (value !== null) setLineEnding(value)
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Line ending"
            className="w-24"
            disabled={!isConnected}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="crlf">CRLF</SelectItem>
            <SelectItem value="lf">LF</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>

        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={
            isConnected
              ? "Type a command… (↑/↓ for history)"
              : "Connect a device to send commands"
          }
          disabled={!isConnected}
          className="flex-1"
          aria-label="Command"
          spellCheck={false}
        />

        <Button
          onClick={() => {
            void send()
          }}
          disabled={!isConnected || draft.trim() === ""}
        >
          <Send />
          Send
        </Button>
      </div>
    </div>
  )
}

export default ConsoleView
