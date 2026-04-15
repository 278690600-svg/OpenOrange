"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value'> & {
    onValueChange?: (value: number[]) => void
    value?: number[]
  }
>(({ className, onValueChange, value, ...props }, ref) => (
  <input
    type="range"
    ref={ref}
    className={cn(
      "w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500",
      className
    )}
    value={value?.[0]}
    onChange={(e) => onValueChange?.([parseFloat(e.target.value)])}
    {...props}
  />
))
Slider.displayName = "Slider"

export { Slider }
