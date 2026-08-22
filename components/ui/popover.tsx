'use client'

import * as React from "react"

interface PopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

interface PopoverTriggerProps {
  asChild?: boolean
  children: React.ReactNode
}

interface PopoverContentProps {
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  className?: string
  children: React.ReactNode
}

const PopoverContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
}>({
  open: false,
  setOpen: () => {}
})

export function Popover({ open, onOpenChange, children }: PopoverProps) {
  return (
    <PopoverContext.Provider value={{ open, setOpen: onOpenChange }}>
      <div className="relative inline-block text-left">{children}</div>
    </PopoverContext.Provider>
  )
}

export function PopoverTrigger({ children }: PopoverTriggerProps) {
  const { open, setOpen } = React.useContext(PopoverContext)

  return (
    <div onClick={() => setOpen(!open)} className="inline-block cursor-pointer">
      {children}
    </div>
  )
}

export function PopoverContent({ className = "", children }: PopoverContentProps) {
  const { open, setOpen } = React.useContext(PopoverContext)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleKeyDown)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, setOpen])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={`absolute left-0 mt-2 z-50 animate-in fade-in-50 slide-in-from-top-2 duration-150 ${className}`}
    >
      {children}
    </div>
  )
}
