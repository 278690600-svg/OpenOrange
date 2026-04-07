"use client"

import * as React from "react"
import { Check } from "lucide-react"

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <div 
        className={`flex items-center justify-center size-4 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-indigo-600 focus-within:ring-2 focus-within:ring-indigo-500 cursor-pointer overflow-hidden ${className}`}
        onClick={() => onCheckedChange?.(!checked)}
      >
        <input
          type="checkbox"
          className="sr-only"
          ref={ref}
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          {...props}
        />
        {checked && <Check className="size-3" />}
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
