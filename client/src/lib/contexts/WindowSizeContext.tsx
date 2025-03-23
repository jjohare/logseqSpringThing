import { createContext, useContext, ReactNode, FC } from 'react';
import { useWindowSize, WindowSize } from '../hooks/useWindowSize';

// Create context with a default value
const WindowSizeContext = createContext<WindowSize | undefined>(undefined);

// Props for the provider component
interface WindowSizeProviderProps {
  children: ReactNode;
}

/**
 * Provider component that wraps the app and provides window size information
 * to all child components that need it
 */
export const WindowSizeProvider: FC<WindowSizeProviderProps> = ({ children }) => {
  const windowSize = useWindowSize();
  
  return (
    <WindowSizeContext.Provider value={windowSize}>
      {children}
    </WindowSizeContext.Provider>
  );
};

/**
 * Hook to use the window size context
 * Throws an error if used outside of the WindowSizeProvider
 */
export function useWindowSizeContext(): WindowSize {
  const context = useContext(WindowSizeContext);
  
  if (context === undefined) {
    throw new Error('useWindowSizeContext must be used within a WindowSizeProvider');
  }
  
  return context;
}