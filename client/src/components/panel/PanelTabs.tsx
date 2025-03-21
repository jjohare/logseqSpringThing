import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { buttonVariants } from '@/components/ui/button';

// Define the tab interface
export interface Tab {
  id: string;
  title: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

// Define the tab context for managing tab state
interface TabContextProps {
  activeTab: string;
  tabs: Tab[];
  addTab: (tab: Tab) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
}

const TabContext = createContext<TabContextProps | undefined>(undefined);

// Hook for accessing tab context
export const useTabContext = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabContext must be used within a TabProvider');
  }
  return context;
};

// Provider component for tab context
interface TabProviderProps {
  children: React.ReactNode;
  defaultTabId?: string;
  initialTabs?: Tab[];
}

export const TabProvider: React.FC<TabProviderProps> = ({
  children,
  defaultTabId,
  initialTabs = []
}) => {
  const [tabs, setTabs] = useState<Tab[]>(initialTabs);
  const [activeTab, setActiveTab] = useState<string>(
    defaultTabId || (initialTabs.length > 0 ? initialTabs[0].id : '')
  );

  // Add a new tab
  const addTab = useCallback((tab: Tab) => {
    setTabs(prevTabs => {
      // Check if tab already exists
      if (prevTabs.some(t => t.id === tab.id)) {
        // Update existing tab
        return prevTabs.map(t => (t.id === tab.id ? { ...t, ...tab } : t));
      }
      // Add new tab
      return [...prevTabs, tab];
    });
    // Set as active tab if it's the first one
    if (tabs.length === 0) {
      setActiveTab(tab.id);
    }
  }, [tabs]);

  // Remove a tab
  const removeTab = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const newTabs = prevTabs.filter(tab => tab.id !== tabId);
      
      // If we're removing the active tab, set a new active tab
      if (activeTab === tabId && newTabs.length > 0) {
        setActiveTab(newTabs[0].id);
      }
      
      return newTabs;
    });
  }, [activeTab]);

  return (
    <TabContext.Provider
      value={{
        activeTab,
        tabs,
        addTab,
        removeTab,
        setActiveTab
      }}
    >
      {children}
    </TabContext.Provider>
  );
};

// Tab List component for displaying tab headers
interface TabListProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const TabList: React.FC<TabListProps> = ({
  orientation = 'horizontal',
  className = ''
}) => {
  const { tabs, activeTab, setActiveTab } = useTabContext();
  const [scrollPosition, setScrollPosition] = useState(0);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const tabListRef = React.useRef<HTMLDivElement>(null);

  // Check if we need scroll buttons
  React.useEffect(() => {
    const checkScroll = () => {
      if (tabListRef.current) {
        const { scrollWidth, clientWidth } = tabListRef.current;
        setShowScrollButtons(scrollWidth > clientWidth);
      }
    };

    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [tabs]);

  // Handle scroll buttons
  const handleScroll = (direction: 'left' | 'right') => {
    if (tabListRef.current) {
      const { scrollLeft, clientWidth } = tabListRef.current;
      const newPosition = direction === 'left' 
        ? Math.max(0, scrollLeft - 100) 
        : scrollLeft + 100;
      
      tabListRef.current.scrollTo({
        left: newPosition,
        behavior: 'smooth'
      });
      
      setScrollPosition(newPosition);
    }
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      {/* Left scroll button */}
      {showScrollButtons && orientation === 'horizontal' && (
        <button
          type="button"
          className={`absolute left-0 z-10 h-8 w-8 rounded-full bg-background/80 shadow-sm ${buttonVariants({
            variant: 'ghost',
            size: 'icon',
          })}`}
          onClick={() => handleScroll('left')}
          disabled={scrollPosition <= 0}
        >
          ←
        </button>
      )}

      {/* Tab list */}
      <div
        ref={tabListRef}
        className={`flex ${
          orientation === 'horizontal'
            ? 'flex-row overflow-x-auto scrollbar-hide'
            : 'flex-col overflow-y-auto'
        } gap-1 px-1`}
        role="tablist"
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tab-panel-${tab.id}`}
            id={`tab-${tab.id}`}
            disabled={tab.disabled}
            className={`flex items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted'
            } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
          >
            {tab.icon && <span className="mr-2">{tab.icon}</span>}
            <span>{tab.title}</span>
          </button>
        ))}
      </div>

      {/* Right scroll button */}
      {showScrollButtons && orientation === 'horizontal' && (
        <button
          type="button"
          className={`absolute right-0 z-10 h-8 w-8 rounded-full bg-background/80 shadow-sm ${buttonVariants({
            variant: 'ghost',
            size: 'icon',
          })}`}
          onClick={() => handleScroll('right')}
          disabled={
            tabListRef.current &&
            scrollPosition >= tabListRef.current.scrollWidth - tabListRef.current.clientWidth - 10
          }
        >
          →
        </button>
      )}
    </div>
  );
};

// Tab panels container
export const TabPanels: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { tabs, activeTab } = useTabContext();
  
  return (
    <div className={`mt-2 ${className}`}>
      <AnimatePresence mode="wait">
        {tabs.map(tab => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`tab-panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            className={activeTab === tab.id ? 'block' : 'hidden'}
          >
            {activeTab === tab.id && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
              >
                {tab.content}
              </motion.div>
            )}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Combined tab component for easier use
interface TabsProps {
  tabs: Tab[];
  defaultTabId?: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  defaultTabId,
  orientation = 'horizontal',
  className = ''
}) => {
  return (
    <TabProvider initialTabs={tabs} defaultTabId={defaultTabId}>
      <div className={className}>
        <TabList orientation={orientation} />
        <TabPanels />
      </div>
    </TabProvider>
  );
};

export default Tabs;