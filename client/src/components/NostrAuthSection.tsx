import React from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { useAuth } from '../lib/hooks/useAuth'

const NostrAuthSection: React.FC = () => {
  const { authenticated, user, authError, login, logout } = useAuth()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nostr Authentication</CardTitle>
        <CardDescription>Authenticate with your Nostr key to unlock advanced features.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col space-y-2">
        {authenticated ? (
          <>
            <div className="flex items-center space-x-2">
              <span>Logged in as:</span>
              <span>{user?.pubkey.slice(0, 8)}...{user?.pubkey.slice(-8)}</span>
            </div>
            <div>
              <span>Role:</span>
              <span>{user?.isPowerUser ? 'Power User' : 'Authenticated User'}</span>
            </div>
            <Button variant="destructive" onClick={logout}>
              Logout
            </Button>
          </>
        ) : (
          <>
            <Button onClick={login}>Login with Nostr</Button>
            {authError && <div className="text-red-500">{authError}</div>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default NostrAuthSection