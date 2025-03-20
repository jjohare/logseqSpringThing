import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultSettings } from '@/lib/config/default-settings'
import { Settings, SettingsPath } from '@/lib/types/settings'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('SettingsStore')

type User = {
  isPowerUser: boolean;
  pubkey: string;
} | null;

type SettingsState = {
  settings: Settings
  initialized: boolean
  authenticated: boolean
  user: User
  setAuthenticated: (authenticated: boolean) => void
  setUser: (user: User) => void
  subscribers: Map<string, Set<() => void>>
  initialize: () => Promise<Settings>
  get: <T>(path: SettingsPath) => T
  set: <T>(path: SettingsPath, value: T) => void
  subscribe: (path: SettingsPath, callback: () => void, immediate?: boolean) => () => void
  unsubscribe: (path: SettingsPath, callback: () => void) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      initialized: false,
      authenticated: false,
      user: null,
      setAuthenticated: (authenticated: boolean) => set({ authenticated }),
      setUser: (user: User) => set({ user }),
      subscribers: new Map(),

      initialize: async () => {
        try {
          // First, load settings from localStorage via Zustand's persist
          const currentState = get()
          
          // Then fetch the latest settings from the server
          const response = await fetch('/api/settings')
          if (!response.ok) {
            throw new Error(`Failed to fetch settings: ${response.statusText}`)
          }
          
          const serverSettings = await response.json()
          
          // Merge server settings with defaults
          const mergedSettings = { ...defaultSettings, ...serverSettings }
          
          set({ 
            settings: mergedSettings,
            initialized: true 
          })
          
          logger.info('Settings initialized successfully')
          return mergedSettings
        } catch (error) {
          logger.error('Failed to initialize settings:', error)
          // Still mark as initialized but use default settings
          set({ initialized: true })
          return get().settings
        }
      },

      get: <T>(path: SettingsPath): T => {
        const settings = get().settings;
        if (path === '') {
          return settings as unknown as T;
        }
        let value: any = settings;
        path.split('.').forEach(key => {
          value = value?.[key as keyof typeof value];
        });
        return value as T;
      },

      set: <T>(path: SettingsPath, value: T) => {
        set(state => {
          // Create a new settings object to ensure immutability
          const newSettings = { ...state.settings }
          
          // Set the value at the specified path
          if (path === '') {
            return { settings: value as unknown as Settings }
          }
          
          const pathParts = path === '' ? [] : (path as string).split('.')
          let current: any = newSettings;
          for (let i = 0; i < pathParts.length - 1; i++) {
            current = current[pathParts[i] as keyof typeof current];
          }
          current[pathParts[pathParts.length - 1] as keyof typeof current] = value;
          
          // Notify subscribers
          const pathParts2 = path === '' ? [] : (path as string).split('.')
          
          // Notify subscribers for the exact path and all parent paths
          for (let i = 0; i <= pathParts2.length; i++) {
            const subPath = i === 0 ? '' : pathParts2.slice(0, i).join('.')
            const callbacks = state.subscribers.get(subPath)
            if (callbacks) {
              callbacks.forEach(callback => {
                try {
                  callback()
                } catch (error) {
                  logger.error(`Error in settings subscriber for ${subPath}:`, error)
                }
              })
            }
          
          }
          return { settings: newSettings }
        })
        
        // Save to server when settings change
        const saveToServer = async () => {
          try {
            const response = await fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(get().settings),
            })
            
            if (!response.ok) {
              throw new Error(`Failed to save settings: ${response.statusText}`)
            }
            
            logger.info('Settings saved to server')
          } catch (error) {
            logger.error('Failed to save settings to server:', error)
          }
        }
        
        // Debounce server save to avoid too many requests
        if (window.saveSettingsTimeout) {
          clearTimeout(window.saveSettingsTimeout)
        }
        window.saveSettingsTimeout = setTimeout(saveToServer, 1000) as unknown as number
      },

      subscribe: (path: SettingsPath, callback: () => void, immediate = true) => {
        set(state => {
          const subscribers = state.subscribers
          const pathStr = path as string
          
          if (!subscribers.has(pathStr)) {
            subscribers.set(pathStr, new Set())
          }
          
          subscribers.get(pathStr)!.add(callback)
          
          return { subscribers: new Map(subscribers) }
        })
        
        // Call the callback immediately if requested
        if (immediate && get().initialized) {
          callback()
        }
        
        // Return unsubscribe function
        return () => get().unsubscribe(path, callback)
      },

      unsubscribe: (path: SettingsPath, callback: () => void) => {
        set(state => {
          const subscribers = state.subscribers
          const pathStr = path as string
          
          if (subscribers.has(pathStr)) {
            subscribers.get(pathStr)!.delete(callback)
            
            if (subscribers.get(pathStr)!.size === 0) {
              subscribers.delete(pathStr)
            }
          }
          
          return { subscribers: new Map(subscribers) }
        })
      }
    }),
    {
      name: 'graph-viz-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ settings: state.settings }),
    }
  )
)

// Augment the Window interface to include our saveSettingsTimeout
declare global {
  interface Window {
    saveSettingsTimeout: number;
  }
}