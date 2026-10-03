import { Menu } from "lucide-react"
import { useSidebar } from "@/components/ui/sidebar"

export const SidebarTriggerButton = () => {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      onClick={toggleSidebar}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-border/40 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Toggle navigation menu"
    >
      <Menu className="h-4 w-4" />
    </button>
  )
}
