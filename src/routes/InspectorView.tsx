import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { MemoryMapEntry, SecurityInfo, Transport } from "esptool-js"
import {
  Cpu,
  HardDrive,
  LoaderCircle,
  Plug,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAppStore } from "@/stores"
import {
  ensureBootloader,
  NotInBootloaderError,
  notifyNotInBootloader,
} from "@/lib/esp/bootloader"
import { formatOffset, getFlashOffsetDefaults } from "@/lib/esp/offsets"
import { describeSerialError } from "@/lib/webserial"

interface SecuritySummary {
  chipId: number | null
  flashCryptCnt: number
  activeFlags: string[]
}

interface InspectorData {
  description: string
  revision: string | null
  features: string[]
  crystalMhz: number
  mac: string
  flashId: string | null
  flashSize: string | null
  isStub: boolean
  memoryMap: MemoryMapEntry[]
  security: SecuritySummary | null
  readAt: string
}

/** Readable names for `SecurityInfo.parsedFlags` flags. */
const FLAG_LABELS: Partial<Record<string, string>> = {
  SECURE_BOOT_EN: "Secure Boot",
  SECURE_BOOT_AGGRESSIVE_REVOKE: "Secure Boot (aggressive revoke)",
  SECURE_DOWNLOAD_ENABLE: "Secure Download Mode",
  SOFT_DIS_JTAG: "JTAG disabled (software)",
  HARD_DIS_JTAG: "JTAG disabled (hardware)",
  DIS_USB: "USB disabled",
}

const toHex = (value: number, digits = 6): string =>
  `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`

async function readOr<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read()
  } catch {
    return fallback
  }
}

const InfoCard = ({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) => (
  <section className="space-y-2 rounded-lg border border-border/60 p-4 shadow-card">
    <div className="flex items-center gap-2 border-b border-border/40 pb-2 text-foreground">
      <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
    {children}
  </section>
)

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
    <span className="truncate text-right text-sm font-medium text-foreground tabular-nums">
      {value}
    </span>
  </div>
)

const MemoryMapList = ({ entries }: { entries: MemoryMapEntry[] }) => (
  <ul className="space-y-1 pt-1">
    {entries.map(([start, end, name]) => (
      <li
        key={`${name}-${start}`}
        className="flex items-baseline justify-between gap-3 text-xs"
      >
        <span className="truncate text-muted-foreground">{name}</span>
        <span className="shrink-0 font-mono text-foreground tabular-nums">
          {toHex(start, 8)} – {toHex(end, 8)}
        </span>
      </li>
    ))}
  </ul>
)

export const InspectorView = () => {
  const status = useAppStore((state) => state.status)
  const chipName = useAppStore((state) => state.chipName)
  const baudRate = useAppStore((state) => state.baudRate)
  const transport = useAppStore((state) => state.transport)
  const loader = useAppStore((state) => state.loader)
  const connect = useAppStore((state) => state.connect)

  // Data is bound to the session (transport) that read it: after
  // disconnecting or reconnecting on another port, stale info is not shown.
  const [stored, setStored] = useState<{
    transport: Transport
    info: InspectorData
  } | null>(null)
  const [reading, setReading] = useState(false)

  const isConnected = status === "connected"
  const data =
    stored !== null && stored.transport === transport ? stored.info : null
  const defaults = useMemo(() => getFlashOffsetDefaults(chipName), [chipName])

  const inspect = async (): Promise<void> => {
    if (!isConnected || !transport || !loader) return

    setReading(true)
    try {
      await ensureBootloader(loader, transport)

      const description = await readOr(
        () => loader.chip.getChipDescription(loader),
        chipName ?? "Unknown"
      )
      const revision = await readOr(
        async () =>
          loader.chip.getChipRevision
            ? String(await loader.chip.getChipRevision(loader))
            : null,
        null
      )
      const features = await readOr<string[]>(
        () => loader.chip.getChipFeatures(loader),
        []
      )
      const crystalMhz = await readOr(
        () => loader.chip.getCrystalFreq(loader),
        0
      )
      const mac = await readOr(() => loader.chip.readMac(loader), "")
      const flashId = await readOr<number | null>(
        () => loader.readFlashId(),
        null
      )
      const flashSize = await readOr(
        async () => (await loader.detectFlashSize()) ?? null,
        null
      )
      const security = await readOr<SecurityInfo | null>(
        () => loader.getSecurityInfo(),
        null
      )

      if (useAppStore.getState().status !== "connected") return

      setStored({
        transport,
        info: {
          description,
          revision,
          features,
          crystalMhz,
          mac,
          flashId: flashId !== null ? toHex(flashId) : null,
          flashSize,
          isStub: loader.IS_STUB,
          memoryMap: loader.chip.MEMORY_MAP,
          security:
            security === null
              ? null
              : {
                  chipId: security.chipId,
                  flashCryptCnt: security.flashCryptCnt,
                  activeFlags: Object.entries(security.parsedFlags)
                    .filter(([, enabled]) => enabled)
                    .map(([name]) => FLAG_LABELS[name] ?? name),
                },
          readAt: new Date().toLocaleTimeString(),
        },
      })
    } catch (error) {
      if (error instanceof NotInBootloaderError) {
        notifyNotInBootloader("read the info")
      } else {
        toast.error("Could not read the info", {
          description: describeSerialError(error).message,
        })
      }
    } finally {
      setReading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-border/40 pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Inspector
        </h1>
        <p className="text-xs text-muted-foreground">
          Read hardware information: chip, MAC, PSRAM and revisions.
        </p>
      </div>

      {!isConnected ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-border/60 bg-background p-8 text-center shadow-card">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Cpu className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">
            Hardware Inspector
          </h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {status === "connecting"
              ? "Syncing with the bootloader…"
              : "Connect a device to read chip, flash and security information."}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {chipName !== null && (
                <Badge variant="secondary" className="font-mono">
                  {chipName}
                </Badge>
              )}
              <Badge variant="outline" className="font-mono">
                {baudRate} baud
              </Badge>
              {data !== null && (
                <span className="text-xs text-muted-foreground">
                  Last read: {data.readAt}
                </span>
              )}
            </div>

            <Button
              size="sm"
              onClick={() => {
                void inspect()
              }}
              disabled={reading}
            >
              {reading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              {reading ? "Reading…" : "Read info"}
            </Button>
          </div>

          {reading && data === null ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <section
                  key={index}
                  className="space-y-3 rounded-lg border border-border/60 p-4 shadow-card"
                >
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </section>
              ))}
            </div>
          ) : data === null ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/10 p-8 text-center">
              <p className="max-w-sm text-xs text-muted-foreground">
                Press «Read info» to identify the chip, its revision, the flash
                and the active security measures.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <InfoCard title="Chip" icon={<Cpu />}>
                <InfoRow label="Name" value={chipName ?? "—"} />
                <InfoRow label="Description" value={data.description || "—"} />
                <InfoRow label="Revision" value={data.revision ?? "—"} />
                <InfoRow
                  label="Crystal"
                  value={data.crystalMhz > 0 ? `${data.crystalMhz} MHz` : "—"}
                />
                <InfoRow label="MAC" value={data.mac || "—"} />
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                  {data.features.length > 0 ? (
                    data.features.map((feature) => (
                      <Badge key={feature} variant="outline">
                        {feature}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No features available.
                    </span>
                  )}
                </div>
                <div className="border-t border-border/40 pt-2">
                  <p className="text-xs text-muted-foreground">
                    Default offsets: bootloader{" "}
                    {formatOffset(defaults.bootloader)} · application{" "}
                    {formatOffset(defaults.app)}
                  </p>
                </div>
              </InfoCard>

              <InfoCard title="Flash" icon={<HardDrive />}>
                <InfoRow label="Flash ID" value={data.flashId ?? "—"} />
                <InfoRow label="Size" value={data.flashSize ?? "—"} />
                <InfoRow
                  label="Runtime"
                  value={data.isStub ? "esptool stub" : "ROM"}
                />
                <div className="border-t border-border/40 pt-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Memory map
                  </p>
                  <MemoryMapList entries={data.memoryMap} />
                </div>
              </InfoCard>

              <InfoCard title="Security" icon={<ShieldCheck />}>
                {data.security === null ? (
                  <p className="text-xs text-muted-foreground">
                    Not available: the chip does not support GET_SECURITY_INFO
                    or the command is blocked.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {data.security.activeFlags.length > 0 ? (
                        data.security.activeFlags.map((flag) => (
                          <Badge key={flag} variant="destructive">
                            {flag}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">No active measures</Badge>
                      )}
                    </div>
                    <InfoRow
                      label="Chip ID"
                      value={
                        data.security.chipId !== null
                          ? toHex(data.security.chipId, 4)
                          : "—"
                      }
                    />
                    <InfoRow
                      label="Flash crypt count"
                      value={String(data.security.flashCryptCnt)}
                    />
                  </>
                )}
              </InfoCard>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default InspectorView
