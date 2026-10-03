import { useMemo } from "react"
import { useLocation } from "react-router-dom"
import { NAVIGATION_CONFIG } from "@/config/navigation"
import type { NavItemConfig } from "@/config/navigation"

export interface ResolvedNavItem extends NavItemConfig {
  isActive: boolean
}

export interface ResolvedNavGroup {
  title: string
  items: ResolvedNavItem[]
}

const resolveActiveItem = (
  pathname: string
): NavItemConfig | { label: string; to: string } => {
  for (const group of NAVIGATION_CONFIG) {
    const match = group.items.find((item) => item.to === pathname)
    if (match) return match
  }

  return { label: "Page", to: pathname }
}

export const useNavigation = () => {
  const location = useLocation()

  const groups: ResolvedNavGroup[] = useMemo(
    () =>
      NAVIGATION_CONFIG.map((group) => ({
        title: group.title,
        items: group.items.map((item) => ({
          ...item,
          isActive: location.pathname === item.to,
        })),
      })),
    [location.pathname]
  )

  // Title of the current page (useful for headers and breadcrumbs)
  const activeItem = resolveActiveItem(location.pathname)

  return {
    groups,
    activeItem,
  }
}
