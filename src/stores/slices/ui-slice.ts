import type { AppSliceCreator, UISlice } from "@/stores/types"

export const createUISlice: AppSliceCreator<UISlice> = (set) => ({
  flasherMode: "simple",
  blockingOperation: null,
  setFlasherMode: (mode) => set({ flasherMode: mode }),
  setBlockingOperation: (operation) => set({ blockingOperation: operation }),
})
