export interface FlashOffsetDefaults {
  /** Bootloader: 0x1000 on classic ESP32, 0x0 on native-USB chips. */
  bootloader: number
  /** Partition table (ESP32 family only; null on ESP8266). */
  partitions: number | null
  /** ota_data / boot_app0 (ESP32 family only; null on ESP8266). */
  otaData: number | null
  /** Application image. */
  app: number
}

const ESP32_CLASSIC: FlashOffsetDefaults = {
  bootloader: 0x1000,
  partitions: 0x8000,
  otaData: 0xe000,
  app: 0x10000,
}

const ESP32_USB_NATIVE: FlashOffsetDefaults = {
  bootloader: 0x0,
  partitions: 0x8000,
  otaData: 0xe000,
  app: 0x10000,
}

const ESP8266: FlashOffsetDefaults = {
  bootloader: 0x0,
  partitions: null,
  otaData: null,
  app: 0x0,
}

const ZERO_BOOTLOADER_CHIPS = [
  "ESP32-S2",
  "ESP32-S3",
  "ESP32-C2",
  "ESP32-C3",
  "ESP32-C5",
  "ESP32-C6",
  "ESP32-C61",
  "ESP32-H2",
  "ESP32-H21",
  "ESP32-H4",
  "ESP32-P4",
  "ESP32-E5",
  "ESP32-E22",
]

/**
 * Default addresses based on the detected chip (`esploader.chipName`).
 * If the chip is not connected or unrecognized, classic ESP32 is suggested.
 */
export const getFlashOffsetDefaults = (
  chipName: string | null
): FlashOffsetDefaults => {
  const name = (chipName ?? "").toUpperCase()

  if (name.includes("ESP8266")) return ESP8266
  if (ZERO_BOOTLOADER_CHIPS.some((chip) => name.includes(chip))) {
    return ESP32_USB_NATIVE
  }
  return ESP32_CLASSIC
}

/**
 * Suggests an offset from the file name (esptool / ESP-IDF convention:
 * bootloader, partition-table, ota_data, boot_app0, merged...).
 */
export const suggestOffsetForFile = (
  fileName: string,
  defaults: FlashOffsetDefaults
): number => {
  const name = fileName.toLowerCase()

  if (name.includes("bootloader")) return defaults.bootloader
  if (name.includes("partition")) return defaults.partitions ?? defaults.app
  if (
    name.includes("ota_data") ||
    name.includes("ota-data") ||
    name.includes("boot_app0") ||
    name.includes("blank")
  ) {
    return defaults.otaData ?? defaults.app
  }
  if (name.includes("merged")) return defaults.bootloader
  return defaults.app
}

export const formatOffset = (offset: number): string =>
  `0x${offset.toString(16).toUpperCase().padStart(4, "0")}`

/** Accepts `0x10000` (hex) or `65536` (decimal). Returns null if invalid. */
export const parseOffset = (input: string): number | null => {
  const value = input.trim()
  if (value === "") return null

  let parsed: number
  if (/^0[xX][0-9a-fA-F]+$/.test(value)) {
    parsed = Number.parseInt(value.slice(2), 16)
  } else if (/^[0-9]+$/.test(value)) {
    parsed = Number.parseInt(value, 10)
  } else {
    return null
  }

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xfffffff) {
    return null
  }
  return parsed
}
