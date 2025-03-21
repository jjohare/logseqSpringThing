import React, { useState, useEffect, ReactNode } from 'react';
import Panel from './Panel';
import { Tabs, Tab } from './PanelTabs';
import { usePanel } from './PanelContext';

interface TabPanelProps {
  id: string;
  title: string;
  initialWidth?: number;
  initialHeight?: number;
  minWidth?: number;
  minHeight?: number;
  tabs: Tab[];
  defaultTabId?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

/**
 * TabPanel component combines a Panel with tab navigation
 * This allows for multiple content areas within a single panel
 */
const TabPanel: React.FC<TabPanelProps> = ({
  id,
  title,
  initialWidth = 320,
  initialHeight = 500,
  minWidth = 240,
  minHeight = 200,
  tabs,
  defaultTabId,
  onTabChange,
  className = '',
}) => {
  const { panels, updatePanelTitle } = usePanel();
  const [activeTabId, setActiveTabId] = useState<string>(
    defaultTabId || (tabs.length > 0 ? tabs[0].id : '')
  );

  // Handle tab change
  const handleTabChange = (tabId: string): void => {
    setActiveTabId(tabId);
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  // Update title with active tab
  useEffect(() => {
    if (activeTabId) {
      const activeTab = tabs.find(tab => tab.id === activeTabId);
      if (activeTab) {
        // Update the panel title to include the active tab
        const newTitle = `${title} - ${activeTab.title}`;
        updatePanelTitle(id, newTitle);
      }
    }
  }, [activeTabId, id, tabs, title, updatePanelTitle]);

  return (
    <Panel 
      id={id} 
      initialWidth={initialWidth} 
      initialHeight={initialHeight} 
      minWidth={minWidth} 
      minHeight={minHeight}
    >
      <div className={`flex flex-col h-full ${className}`}>
        <Tabs 
          tabs={tabs} 
          defaultTabId={activeTabId} 
          orientation="horizontal" 
          className="flex-none" 
        />
      </div>
    </Panel>
  );
};

export default TabPanel;