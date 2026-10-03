import type { ComponentType } from "react"
import {
  Cpu,
  Terminal,
  RotateCcw,
  Upload,
  HardDriveDownload,
  Combine,
} from "lucide-react"

export interface NavItemConfig {
  id: string
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
}

export interface NavGroupConfig {
  title: string
  items: NavItemConfig[]
}

export const NAVIGATION_CONFIG: readonly NavGroupConfig[] = [
  {
    title: "Device",
    items: [
      {
        id: "inspector",
        label: "Inspector",
        to: "/inspector",
        icon: Cpu,
      },
      {
        id: "console",
        label: "Console",
        to: "/consola",
        icon: Terminal,
      },
      {
        id: "reset",
        label: "Reset",
        to: "/reset",
        icon: RotateCcw,
      },
    ],
  },
  {
    title: "Firmware",
    items: [
      {
        id: "flasher",
        label: "Flasher",
        to: "/flasher",
        icon: Upload,
      },
      {
        id: "backup",
        label: "Backup",
        to: "/backup",
        icon: HardDriveDownload,
      },
      {
        id: "generator",
        label: "Bin Generator",
        to: "/generador",
        icon: Combine,
      },
    ],
  },
]
