import { useState } from "react"
import type { KeyboardEvent } from "react"
import { LoaderCircle, Plug, Unplug } from "lucide-react"
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
import type { EspConnectionStatus } from "@/stores/types"
import { BAUD_RATES, MAX_BAUD_RATE, MIN_BAUD_RATE } from "@/lib/webserial"
import { cn } from "@/lib/utils"

interface ConnectionControlProps {
  className?: string
}

const STATUS_LABEL: Record<EspConnectionStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
  disconnecting: "Closing",
}

export const ConnectionControl = ({ className }: ConnectionControlProps) => {
  const isSupported = useAppStore((state) => state.isSupported)
  const status = useAppStore((state) => state.status)
  const baudRate = useAppStore((state) => state.baudRate)
  const chipName = useAppStore((state) => state.chipName)
  const portLabel = useAppStore((state) => state.portLabel)
  const setBaudRate = useAppStore((state) => state.setBaudRate)
  const connect = useAppStore((state) => state.connect)
  const disconnect = useAppStore((state) => state.disconnect)

  const isConnected = status === "connected"
  const isBusy = status === "connecting" || status === "disconnecting"
  const canSelectBaudRate = status === "disconnected"

  const [menuOpen, setMenuOpen] = useState(false)
  const [customBaud, setCustomBaud] = useState("")

  const applyCustomBaud = (): void => {
    const raw = customBaud.replace(/\s+/g, "")

    if (!/^\d+$/.test(raw)) {
      toast.error("Invalid baud rate", {
        description: "Type a whole number, for example 1500000.",
      })
      return
    }

    const value = Number(raw)
    if (value < MIN_BAUD_RATE || value > MAX_BAUD_RATE) {
      toast.error("Invalid baud rate", {
        description: `Allowed range: ${MIN_BAUD_RATE} to ${MAX_BAUD_RATE} baud.`,
      })
      return
    }

    setBaudRate(value)
    setMenuOpen(false)
  }

  const handleCustomKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ): void => {
    if (event.key === "Enter") {
      event.preventDefault()
      applyCustomBaud()
    }
  }

  const handleToggle = (): void => {
    if (!isSupported) {
      toast.error("WebSerial not available", {
        description:
          "Use Chrome, Edge or Opera on desktop with HTTPS or localhost.",
      })
      return
    }

    if (isConnected) {
      void disconnect()
    } else {
      void connect()
    }
  }

  const buttonLabel =
    status === "connecting"
      ? "Connecting"
      : status === "disconnecting"
        ? "Closing"
        : isConnected
          ? "Disconnect"
          : "Connect"

  const statusLabel = isConnected && chipName ? chipName : STATUS_LABEL[status]

  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      <Badge
        variant={isConnected ? "outline" : "secondary"}
        className="hidden gap-1.5 sm:inline-flex"
        title={portLabel ? `Port ${portLabel}` : STATUS_LABEL[status]}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            isConnected
              ? "bg-emerald-500"
              : isBusy
                ? "animate-pulse bg-amber-500"
                : "bg-muted-foreground/40"
          )}
        />
        {statusLabel}
      </Badge>

      <Select
        value={String(baudRate)}
        onValueChange={(value) => setBaudRate(Number(value))}
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open)
          if (open) setCustomBaud(String(baudRate))
        }}
        disabled={!canSelectBaudRate}
      >
        <SelectTrigger
          size="sm"
          aria-label="Baudrate"
          disabled={!canSelectBaudRate}
          title={
            canSelectBaudRate
              ? "Communication speed"
              : "Disconnect to change the baud rate"
          }
          className="w-[7rem]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          footer={
            <div className="sticky bottom-0 z-20 border-t border-border bg-popover p-1.5">
              <div className="px-1.5 py-1 text-xs text-muted-foreground">
                Custom baud rate
              </div>
              <div className="flex flex-col gap-1.5">
                <Input
                  value={customBaud}
                  onChange={(event) => setCustomBaud(event.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 1500000"
                  aria-label="Custom baud rate"
                  className="h-7"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={applyCustomBaud}
                >
                  Apply
                </Button>
              </div>
            </div>
          }
        >
          {BAUD_RATES.map((rate) => (
            <SelectItem key={rate} value={String(rate)}>
              {rate}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        size="default"
        variant={isConnected ? "outline" : "default"}
        onClick={handleToggle}
        disabled={!isSupported || isBusy}
        title={
          isSupported ? undefined : "Your browser does not support WebSerial"
        }
      >
        {isBusy ? (
          <LoaderCircle className="animate-spin" />
        ) : isConnected ? (
          <Unplug />
        ) : (
          <Plug />
        )}
        {buttonLabel}
      </Button>
    </div>
  )
}

export default ConnectionControl
