import { Component } from "react"
import type { ReactNode, ErrorInfo } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryInner extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Exception caught in ErrorBoundary:", error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[360px] w-full flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            An error occurred in this view
          </h2>
          <p className="mt-2 max-w-md text-sm text-pretty text-muted-foreground">
            {this.state.error?.message ??
              "The requested module could not be rendered."}
          </p>
          <Button
            variant="outline"
            onClick={this.handleReset}
            className="mt-6 min-h-[44px] gap-2"
          >
            <RotateCcw className="h-4 w-4" /> Retry
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

export const ErrorBoundary = ({ children, fallback }: ErrorBoundaryProps) => {
  return <ErrorBoundaryInner fallback={fallback}>{children}</ErrorBoundaryInner>
}
