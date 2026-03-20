import React from 'react'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <div className="border-border border-b px-4 py-3">
      <h1 className="text-sm font-semibold">{title}</h1>
      {subtitle && <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>}
    </div>
  )
}
