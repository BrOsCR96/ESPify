import type { ComponentProps } from "react"
import { useNavigate } from "react-router-dom"
import {
  Sun,
  Moon,
  Laptop,
  LoaderCircle,
  Gamepad2,
  Monitor,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useNavigation } from "@/hooks/use-navigation"
import { useAppStore } from "@/stores"
import type { BlockingOperation } from "@/stores/types"
import { useThemeStore } from "@/stores/use-theme-store"
import { cn } from "@/lib/utils"

const BLOCKING_LABELS: Record<BlockingOperation, string> = {
  backup: "Backup in progress",
  flash: "Flashing",
  erase: "Erasing flash",
}

export const AppSidebar = (props: ComponentProps<typeof Sidebar>) => {
  const navigate = useNavigate()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const isCollapsed = state === "collapsed"
  const { groups } = useNavigation()
  const blockingOperation = useAppStore((s) => s.blockingOperation)
  const isBlocked = blockingOperation !== null
  const blockingLabel =
    blockingOperation !== null ? BLOCKING_LABELS[blockingOperation] : ""

  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  const uiStyle = useThemeStore((s) => s.uiStyle)
  const setUiStyle = useThemeStore((s) => s.setUiStyle)

  const handleNavigation = (to: string) => {
    // Backup or flash in progress: the view cannot change until it finishes.
    if (isBlocked) return
    void navigate(to)
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-border/40"
      {...props}
    >
      {/* Clean header */}
      <SidebarHeader className="h-14 justify-center border-b border-border/40 px-3">
        <div className="flex items-center gap-2.5 px-2">
          <span
            className={cn(
              "truncate text-sm font-bold tracking-tight text-foreground",
              isCollapsed && "hidden"
            )}
          >
            ESPify
          </span>
        </div>
      </SidebarHeader>

      {/* Menu generated from NAVIGATION_CONFIG via useNavigation */}
      <SidebarContent className="gap-4 px-2 py-3">
        {isBlocked && (
          <div
            className="flex items-center gap-2 rounded-md bg-sidebar-accent px-2 py-1.5 text-xs text-sidebar-accent-foreground"
            role="status"
          >
            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className={cn("truncate", isCollapsed && "hidden")}>
              {blockingLabel}… navigation locked
            </span>
          </div>
        )}

        {groups.map((group) => (
          <SidebarGroup key={group.title} className="p-0">
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon

                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={item.isActive}
                        tooltip={
                          isBlocked
                            ? "Wait for the current process to finish"
                            : item.label
                        }
                        onClick={() => handleNavigation(item.to)}
                        disabled={isBlocked}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer: Light / Dark / System theme selector */}
      {/* Style: exclusive Normal / 8-bit switch, independent from the theme */}
      <SidebarFooter className="border-t border-border/40 p-2">
        <div
          className={cn(
            "mb-2 flex items-center gap-0.5 rounded-lg border border-border/40 bg-muted/40 p-0.5",
            isCollapsed && "flex-col gap-1"
          )}
          role="group"
          aria-label="Interface style"
        >
          <button
            onClick={() => setUiStyle("standard")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-all",
              uiStyle === "standard"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Normal style"
            aria-label="Normal style"
            aria-pressed={uiStyle === "standard"}
          >
            <Monitor className="h-3.5 w-3.5 shrink-0" />
            <span className={cn("text-[11px]", isCollapsed && "hidden")}>
              Normal
            </span>
          </button>

          <button
            onClick={() => setUiStyle("8bit")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-all",
              uiStyle === "8bit"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="8-bit style"
            aria-label="8-bit style"
            aria-pressed={uiStyle === "8bit"}
          >
            <Gamepad2 className="h-3.5 w-3.5 shrink-0" />
            <span className={cn("text-[11px]", isCollapsed && "hidden")}>
              8-bit
            </span>
          </button>
        </div>

        {/* Theme: Light / Dark / System, independent from the style */}
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border border-border/40 bg-muted/40 p-1",
            isCollapsed && "flex-col gap-1 p-1"
          )}
        >
          <button
            onClick={() => setTheme("light")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-all",
              theme === "light"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Light mode"
            aria-label="Light mode"
          >
            <Sun className="h-3.5 w-3.5 shrink-0" />
            <span className={cn("text-[11px]", isCollapsed && "hidden")}>
              Light
            </span>
          </button>

          <button
            onClick={() => setTheme("dark")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-all",
              theme === "dark"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Dark mode"
            aria-label="Dark mode"
          >
            <Moon className="h-3.5 w-3.5 shrink-0" />
            <span className={cn("text-[11px]", isCollapsed && "hidden")}>
              Dark
            </span>
          </button>

          <button
            onClick={() => setTheme("system")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-xs font-medium transition-all",
              theme === "system"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
              isCollapsed && "hidden"
            )}
            title="Automatic theme"
            aria-label="Automatic theme"
          >
            <Laptop className="h-3.5 w-3.5 shrink-0" />
            <span className={cn("text-[11px]", isCollapsed && "hidden")}>
              Auto
            </span>
          </button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
