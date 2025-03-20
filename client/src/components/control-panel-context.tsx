import React, { createContext, useContext, useState, ReactNode } from 'react'

interface ControlPanelContextType {
  advancedMode: boolean
  setAdvancedMode: (value: boolean) => void
}

const ControlPanelContext = createContext<ControlPanelContextType | null>(null)

export function useControlPanelContext() {
  const context = useContext(ControlPanelContext)
  if (!context) {
    throw new Error('useControlPanelContext must be used within a ControlPanelProvider')
  }
  return context
}

interface ControlPanelProviderProps {
  children: ReactNode
}

export function ControlPanelProvider({ children }: ControlPanelProviderProps) {
  const [advancedMode, setAdvancedMode] = useState(false)

  const value = {
    advancedMode,
    setAdvancedMode
  }

  return (
    <ControlPanelContext.Provider value={value}>
      {children}
    </ControlPanelContext.Provider>
  )
}