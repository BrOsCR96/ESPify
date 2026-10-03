import { lazy, Suspense } from "react"
import type { ReactNode } from "react"
import { Navigate, createBrowserRouter, RouterProvider } from "react-router-dom"
import { RootLayout } from "@/layouts/RootLayout"
import { ErrorBoundary } from "@/components/common/ErrorBoundary"
import { RouteSkeleton } from "@/components/common/RouteSkeleton"

const InspectorView = lazy(() => import("@/routes/InspectorView"))
const BackupView = lazy(() => import("@/routes/BackupView"))
const FlasherView = lazy(() => import("@/routes/FlasherView"))
const GeneratorView = lazy(() => import("@/routes/GeneratorView"))
const ConsoleView = lazy(() => import("@/routes/ConsoleView"))
const ResetView = lazy(() => import("@/routes/ResetView"))
const NotFoundView = lazy(() => import("@/routes/NotFoundView"))

const withViewBoundary = (Component: React.ComponentType): ReactNode => (
  <ErrorBoundary>
    <Suspense fallback={<RouteSkeleton />}>
      <Component />
    </Suspense>
  </ErrorBoundary>
)

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/inspector" replace />,
      },
      {
        path: "inspector",
        element: withViewBoundary(InspectorView),
      },
      {
        path: "backup",
        element: withViewBoundary(BackupView),
      },
      {
        path: "flasher",
        element: withViewBoundary(FlasherView),
      },
      {
        path: "generador",
        element: withViewBoundary(GeneratorView),
      },
      {
        path: "consola",
        element: withViewBoundary(ConsoleView),
      },
      {
        path: "reset",
        element: withViewBoundary(ResetView),
      },
      {
        path: "*",
        element: withViewBoundary(NotFoundView),
      },
    ],
  },
])

export const AppRouter = () => {
  return <RouterProvider router={router} />
}

export default AppRouter
