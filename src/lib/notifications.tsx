"use client"

import { Toaster, toast } from "sonner"
import { CheckCircle, AlertCircle, Info, XCircle, Loader2 } from "lucide-react"

export type NotificationType = "success" | "error" | "info" | "warning" | "loading"

export interface NotificationOptions {
  title?: string
  description?: string
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

export function notify(type: NotificationType, message: string, options?: NotificationOptions) {
  const iconMap = {
    success: <CheckCircle className="size-4 text-green-500" />,
    error: <XCircle className="size-4 text-red-500" />,
    info: <Info className="size-4 text-blue-500" />,
    warning: <AlertCircle className="size-4 text-yellow-500" />,
    loading: <Loader2 className="size-4 animate-spin text-zinc-500" />
  }

  switch (type) {
    case "success":
      return toast.success(options?.title || "Success", {
        description: options?.description || message,
        duration: options?.duration || 3000,
        icon: iconMap.success,
      })
    case "error":
      return toast.error(options?.title || "Error", {
        description: options?.description || message,
        duration: options?.duration || 5000,
        icon: iconMap.error,
      })
    case "info":
      return toast.info(options?.title || "Info", {
        description: options?.description || message,
        duration: options?.duration || 4000,
        icon: iconMap.info,
      })
    case "warning":
      return toast.warning(options?.title || "Warning", {
        description: options?.description || message,
        duration: options?.duration || 4000,
        icon: iconMap.warning,
      })
    case "loading":
      return toast.loading(options?.title || "Loading...", {
        description: options?.description || message,
        icon: iconMap.loading,
      })
  }
}

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      expand={false}
      richColors
      closeButton
      toastOptions={{
        duration: 4000,
        style: {
          background: "hsl(var(--background))",
          border: "1px solid hsl(var(--border))",
        },
      }}
    />
  )
}

const notifications = { notify, AppToaster };
export default notifications;
