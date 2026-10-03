import { useEffect, useState } from "react"
import type { DragEvent as ReactDragEvent } from "react"
import { toast } from "sonner"

// Same extensions the hidden file input accepts (.bin and .img).
const ACCEPTED_FILE = /\.(bin|img)$/i

const includesFiles = (dataTransfer: DataTransfer | null): boolean =>
  dataTransfer?.types.includes("Files") ?? false

export interface UseFileDropOptions {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export const useFileDrop = ({
  onFiles,
  disabled = false,
}: UseFileDropOptions) => {
  const [dragActive, setDragActive] = useState(false)

  // Blocks the browser default (navigating to the file) when it is dropped
  // outside the zone and hides the highlight if the drag ends up there.
  useEffect(() => {
    const preventNavigation = (event: DragEvent) => {
      if (!includesFiles(event.dataTransfer)) return
      event.preventDefault()
      if (event.type === "drop") setDragActive(false)
    }
    const resetIfLeftWindow = (event: DragEvent) => {
      if (event.relatedTarget === null) setDragActive(false)
    }
    window.addEventListener("dragover", preventNavigation)
    window.addEventListener("drop", preventNavigation)
    window.addEventListener("dragleave", resetIfLeftWindow)
    return () => {
      window.removeEventListener("dragover", preventNavigation)
      window.removeEventListener("drop", preventNavigation)
      window.removeEventListener("dragleave", resetIfLeftWindow)
    }
  }, [])

  const onDragEnter = (event: ReactDragEvent) => {
    if (disabled || !includesFiles(event.dataTransfer)) return
    event.preventDefault()
    setDragActive(true)
  }

  const onDragOver = (event: ReactDragEvent) => {
    if (disabled || !includesFiles(event.dataTransfer)) return
    // Required for the drop event to fire on the zone.
    event.preventDefault()
    setDragActive(true)
  }

  const onDragLeave = (event: ReactDragEvent) => {
    const target = event.relatedTarget
    if (target instanceof Node && event.currentTarget.contains(target)) return
    setDragActive(false)
  }

  const onDrop = (event: ReactDragEvent) => {
    event.preventDefault()
    setDragActive(false)
    if (disabled) return

    const dropped = Array.from(event.dataTransfer.files)
    if (dropped.length === 0) return

    const accepted = dropped.filter((file) => ACCEPTED_FILE.test(file.name))
    if (accepted.length === 0) {
      toast.error("Unsupported file type", {
        description: "Only .bin and .img files can be added.",
      })
      return
    }
    onFiles(accepted)
    if (accepted.length < dropped.length) {
      toast.warning("Some files were skipped", {
        description: "Only .bin and .img files can be added.",
      })
    }
  }

  return {
    dragActive,
    dropZone: { onDragEnter, onDragOver, onDragLeave, onDrop },
  }
}
