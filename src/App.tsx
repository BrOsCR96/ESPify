import { useEffect } from "react"
import { AppRouter } from "@/routes"
import { useThemeStore } from "@/stores/use-theme-store"

export const App = () => {
  const initThemeListener = useThemeStore((state) => state.initThemeListener)

  useEffect(() => {
    const unsubscribe = initThemeListener()
    return () => unsubscribe()
  }, [initThemeListener])

  return <AppRouter />
}

export default App
