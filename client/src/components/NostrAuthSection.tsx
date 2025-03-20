import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('NostrAuthSection')

interface NostrUser {
  pubkey: string
  isPowerUser: boolean
}

interface AuthState {
  authenticated: boolean
  user: NostrUser | null
}

// Placeholder for the actual NostrAuthService
const mockNostrAuth = {
  isInitialized: false,
  loginInProgress: false,
  
  async initialize() {
    logger.info('Initializing NostrAuth')
    this.isInitialized = true
    return true
  },
  
  async login() {
    logger.info('Logging in with Nostr')
    this.loginInProgress = true
    
    // Simulate login delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Simulate successful login
    this.loginInProgress = false
    return {
      authenticated: true,
      user: {
        pubkey: 'npub1abcdefghijklmnopqrstuvwxyz0123456789',
        isPowerUser: true
      }
    }
  },
  
  async logout() {
    logger.info('Logging out from Nostr')
    
    // Simulate logout delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    return {
      authenticated: false,
      user: null
    }
  },
  
  onAuthStateChanged(callback: (state: AuthState) => void) {
    // In the real implementation, this would listen for auth state changes
    // For now, we'll just call it once with a mock state
    setTimeout(() => {
      callback({
        authenticated: false,
        user: null
      })
    }, 0)
    
    // Return an unsubscribe function
    return () => {
      logger.info('Unsubscribed from auth state changes')
    }
  }
}

export function NostrAuthSection() {
  const [authState, setAuthState] = useState<AuthState>({
    authenticated: false,
    user: null
  })
  
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    // Initialize Nostr auth on component mount
    const initAuth = async () => {
      try {
        await mockNostrAuth.initialize()
      } catch (err) {
        logger.error('Failed to initialize Nostr auth:', err)
      }
    }
    
    initAuth()
    
    // Subscribe to auth state changes
    const unsubscribe = mockNostrAuth.onAuthStateChanged(setAuthState)
    
    // Cleanup subscription on unmount
    return () => {
      unsubscribe()
    }
  }, [])
  
  const handleLogin = async () => {
    setIsLoggingIn(true)
    setError(null)
    
    try {
      const result = await mockNostrAuth.login()
      setAuthState(result)
    } catch (err) {
      logger.error('Nostr login failed:', err)
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoggingIn(false)
    }
  }
  
  const handleLogout = async () => {
    setIsLoggingOut(true)
    
    try {
      const result = await mockNostrAuth.logout()
      setAuthState(result)
    } catch (err) {
      logger.error('Nostr logout failed:', err)
    } finally {
      setIsLoggingOut(false)
    }
  }
  
  return (
    <Card className="settings-section mb-4">
      <CardHeader className="py-2 px-4">
        <CardTitle className="text-sm font-medium">Authentication</CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className="flex items-center justify-between">
          <div>
            {authState.authenticated && authState.user ? (
              <div className="user-info">
                <div className="text-sm font-medium">
                  {authState.user.pubkey.substring(0, 8)}...
                </div>
                <div className="text-xs text-muted-foreground">
                  {authState.user.isPowerUser ? 'Power User' : 'Basic User'}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Not authenticated
              </div>
            )}
            
            {error && (
              <div className="mt-1 text-xs text-red-500">
                {error}
              </div>
            )}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            disabled={isLoggingIn || isLoggingOut}
            onClick={authState.authenticated ? handleLogout : handleLogin}
          >
            {isLoggingIn ? 'Connecting...' : 
             isLoggingOut ? 'Logging out...' : 
             authState.authenticated ? 'Logout' : 'Login with Nostr'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}