import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { AppStore } from "@/stores/types"
import { createUISlice } from "@/stores/slices/ui-slice"
import { createEspSlice } from "@/stores/slices/esp-slice"

export const useAppStore = create<AppStore>()(
  persist(
    (...args) => ({
      ...createUISlice(...args),
      ...createEspSlice(...args),
    }),
    {
      name: "espify-storage",
      storage: createJSONStorage(() => localStorage),
      // Granular persistence: the connection state (port, transport, loader,
      // chip) is ephemeral and must never be serialized to localStorage.
      partialize: (state) => ({
        flasherMode: state.flasherMode,
      }),
    }
  )
)
