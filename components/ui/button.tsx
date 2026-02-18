/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "secondary"
  size?: "default" | "sm" | "lg"
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild, children, ...props }, ref) => {
    // Check if custom button classes are present (tweakcn or landing)
    const classNameStr = typeof className === "string" ? className : ""
    const hasCustomBtnClass = classNameStr.includes("btn-primary") ||
                             classNameStr.includes("btn-navy") ||
                             classNameStr.includes("btn-blue") ||
                             classNameStr.includes("btn-gold") ||
                             classNameStr.includes("btn-green") ||
                             classNameStr.includes("btn-landing-primary") ||
                             classNameStr.includes("btn-landing-secondary")
    
    const baseClasses = cn(
      "inline-flex items-center justify-center text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
      {
        // Only apply default variant styles if no tweakcn class is present
        "rounded-md bg-primary text-primary-foreground hover:opacity-90": variant === "default" && !hasCustomBtnClass,
        "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground rounded-md": variant === "outline" && !hasCustomBtnClass,
        "hover:bg-accent hover:text-accent-foreground rounded-md": variant === "ghost" && !hasCustomBtnClass,
        "bg-secondary text-secondary-foreground hover:opacity-80 rounded-md": variant === "secondary" && !hasCustomBtnClass,
        "h-10 px-4 py-2": size === "default" && !hasCustomBtnClass,
        "h-9 px-3 text-xs": size === "sm" && !hasCustomBtnClass,
        "h-11 px-8": size === "lg" && !hasCustomBtnClass,
      },
      className
    )

    if (asChild && React.isValidElement(children)) {
      // Don't pass 'ref' here, since React.cloneElement does not attach refs; ref forwarding must be handled differently.
      return React.cloneElement(
        children as React.ReactElement<any>,
        {
          className: cn(
            baseClasses,
            (children as React.ReactElement<any>).props?.className
          ),
          ...props,
        }
      )
    }

    return (
      <button
        className={baseClasses}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button }
