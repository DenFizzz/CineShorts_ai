// src/components/ThemeProviderWrapper.tsx
"use client"

import { ThemeProvider } from "next-themes"
import { ReactNode } from "react"

export function ThemeProviderWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"           // или "light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}