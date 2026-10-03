import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export const NotFoundView = () => {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <span className="text-6xl font-black tracking-tighter text-muted-foreground/40">
        404
      </span>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-balance text-muted-foreground">
        The route you are trying to access does not exist or was moved.
      </p>
      <Link to="/" className="mt-6">
        <Button className="min-h-[44px]">Back to home</Button>
      </Link>
    </div>
  )
}

export default NotFoundView
