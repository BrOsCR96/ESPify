import { useState, useEffect, lazy, Suspense } from "react"
import type { ReactNode } from "react"
import { Outlet, useBlocker } from "react-router-dom"
import { toast } from "sonner"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SidebarTriggerButton } from "@/components/layout/SidebarTriggerButton"
import { ConnectionControl } from "@/components/layout/ConnectionControl"
import { useAppStore } from "@/stores"
import type { BlockingOperation } from "@/stores/types"
import { useThemeStore } from "@/stores/use-theme-store"

const LazyToaster = lazy(() =>
  import("@/components/ui/sonner").then((m) => ({ default: m.Toaster }))
)
// Stable identity for useBlocker: reads the store at navigation time
// (sidebar, back button, links) without re-subscriptions.
const blockDuringFlashOperation = (): boolean =>
  useAppStore.getState().blockingOperation !== null

const BLOCKED_NAVIGATION_HINTS: Record<BlockingOperation, string> = {
  backup: "Wait for the backup to finish before changing views.",
  flash: "Wait for the flash operation to finish before changing views.",
  erase: "Wait for the erase to finish before changing views.",
}

interface RootLayoutProps {
  children?: ReactNode
}

export const RootLayout = ({ children }: RootLayoutProps) => {
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme)
  const [shouldLoadToaster, setShouldLoadToaster] = useState(false)

  // Blocks any view change while a long flash operation is running.
  const blocker = useBlocker(blockDuringFlashOperation)

  useEffect(() => {
    if (blocker.state === "blocked") {
      const operation = useAppStore.getState().blockingOperation
      toast.info("Navigation locked", {
        description:
          operation !== null
            ? BLOCKED_NAVIGATION_HINTS[operation]
            : "Wait for the current operation to finish before changing views.",
      })
      blocker.reset()
    }
  }, [blocker])

  useEffect(() => {
    const timer = setTimeout(() => setShouldLoadToaster(true), 1500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          role="banner"
          className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/40 bg-background/80 px-4 backdrop-blur-md sm:px-6"
        >
          <SidebarTriggerButton />

          <ConnectionControl className="ml-auto" />
        </header>

        <main id="main-content" role="main" className="w-full flex-1">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>

      {shouldLoadToaster && (
        <Suspense fallback={null}>
          <LazyToaster
            theme={resolvedTheme}
            position="bottom-right"
            richColors
          />
        </Suspense>
      )}
    </SidebarProvider>
  )
}
