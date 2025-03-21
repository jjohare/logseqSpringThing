import React, { createContext, useContext, useState, useEffect } from 'react';

// Define layout presets for different screen sizes and use cases
const layoutPresets = {
  default: {
    settings: {
      position: { x: window.innerWidth - 320, y: 20 },
      size: { width: 300, height: 500 },
      isOpen: true,
      isDocked: true,
      dockPosition: 'right',
    }
  },
  compact: {
    settings: {
      position: { x: window.innerWidth - 250, y: 20 },
      size: { width: 230, height: 400 },
      isOpen: true,
      isDocked: true,
      dockPosition: 'right',
    }
  },
  expanded: {
    settings: {
      position: { x: window.innerWidth - 400, y: 20 },
      size: { width: 380, height: 600 },
      isOpen: true,
      isDocked: true,
      dockPosition: 'right',
    }
  },
  mobile: {
    settings: {
      position: { x: 0, y: window.innerHeight - 300 },
      size: { width: window.innerWidth, height: 300 },
      isOpen: true,
      isDocked: true,
      dockPosition: 'bottom',
    }
  }
};

// Define the default panel positions and states
const defaultPanels = {
  settings: {
    id: 'settings',
    title: 'Settings',
    position: { x: window.innerWidth - 320, y: 20 },
    size: { width: 300, height: 500 },
    isOpen: true,
    isCollapsed: false,
    isDocked: true,
    dockPosition: 'right', // 'left', 'right', 'top', 'bottom'
    zIndex: 100,
    groupId: 'rightGroup', // For panel grouping
    activeInGroup: true,   // Whether this panel is active in its group
  },
  console: {
    id: 'console',
    title: 'Console',
    position: { x: window.innerWidth - 320, y: 20 },
    size: { width: 300, height: 500 },
    isOpen: false,
    isCollapsed: false,
    isDocked: true,
    dockPosition: 'right',
    zIndex: 100,
    groupId: 'rightGroup',
    activeInGroup: false,
  },
  // Add more default panels as needed
};

const PanelContext = createContext();

export const PanelProvider = ({ children }) => {
  // Initialize panels from localStorage or use defaults
  const [panels, setPanels] = useState(() => {
    const savedPanels = localStorage.getItem('panels');
    return savedPanels ? JSON.parse(savedPanels) : defaultPanels;
  });

  // Save panels to localStorage when they change
  useEffect(() => {
    localStorage.setItem('panels', JSON.stringify(panels));
  }, [panels]);

  // Update panel position
  const updatePanelPosition = (id, position) => {
    setPanels((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        position,
        isDocked: false, // Moving a panel undocks it
      },
    }));
  };

  // Update panel size
  const updatePanelSize = (id, size) => {
    setPanels((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        size,
      },
    }));
  };

  // Update panel title
  const updatePanelTitle = (id, title) => {
    setPanels((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        title,
      },
    }));
  };

  // Toggle panel open/closed state
  const togglePanelOpen = (id) => {
    setPanels((prev) => {
      const panel = prev[id];
      if (!panel) return prev;

      // If panel is part of a group and being opened, make it active in the group
      if (!panel.isOpen && panel.groupId) {
        const updatedPanels = { ...prev };
        
        // Deactivate all panels in the same group
        Object.keys(updatedPanels).forEach(panelId => {
          if (updatedPanels[panelId].groupId === panel.groupId) {
            updatedPanels[panelId] = {
              ...updatedPanels[panelId],
              activeInGroup: false
            };
          }
        });
        
        // Set this panel as active and open
        updatedPanels[id] = {
          ...panel,
          isOpen: !panel.isOpen,
          activeInGroup: !panel.isOpen
        };
        
        return updatedPanels;
      }
      
      // Regular toggle if not in a group
      return {
        ...prev,
        [id]: {
          ...panel,
          isOpen: !panel.isOpen,
        },
      };
    });
  };

  // Toggle panel collapsed state
  const togglePanelCollapsed = (id) => {
    setPanels((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        isCollapsed: !prev[id].isCollapsed,
      },
    }));
  };

  // Dock panel to a specific position
  const dockPanel = (id, position) => {
    setPanels((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        isDocked: true,
        dockPosition: position,
        // Calculate position based on dock position
        position: calculateDockedPosition(position, prev[id].size),
      },
    }));
  };

  // Helper function to calculate position based on dock position
  const calculateDockedPosition = (dockPosition, size) => {
    switch (dockPosition) {
      case 'left':
        return { x: 0, y: 20 };
      case 'right':
        return { x: window.innerWidth - (size?.width || 300), y: 20 };
      case 'top':
        return { x: 20, y: 0 };
      case 'bottom':
        return { x: 20, y: window.innerHeight - (size?.height || 300) };
      default:
        return { x: 0, y: 0 };
    }
  };

  // Bring panel to front
  const bringToFront = (id) => {
    const highestZ = Math.max(...Object.values(panels).map(panel => panel.zIndex || 0));
    setPanels((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        zIndex: highestZ + 1,
      },
    }));
  };

  // Reset all panels to default positions
  const resetPanels = () => {
    setPanels(defaultPanels);
  };

  // Activate a panel in its group
  const activatePanelInGroup = (id) => {
    setPanels((prev) => {
      const panel = prev[id];
      if (!panel || !panel.groupId) return prev;
      
      const updatedPanels = { ...prev };
      
      // Deactivate all panels in the same group
      Object.keys(updatedPanels).forEach(panelId => {
        if (updatedPanels[panelId].groupId === panel.groupId) {
          updatedPanels[panelId] = {
            ...updatedPanels[panelId],
            activeInGroup: false
          };
        }
      });
      
      // Activate the selected panel
      updatedPanels[id] = {
        ...updatedPanels[id],
        activeInGroup: true,
        isOpen: true
      };
      
      return updatedPanels;
    });
  };

  // Apply a layout preset
  const applyLayout = (layoutName) => {
    const layout = layoutPresets[layoutName];
    if (!layout) return;
    
    setPanels(prev => {
      const newPanels = { ...prev };
      
      Object.keys(layout).forEach(panelId => {
        if (newPanels[panelId]) {
          newPanels[panelId] = {
            ...newPanels[panelId],
            ...layout[panelId]
          };
        }
      });
      
      return newPanels;
    });
  };

  // Create a new panel
  const createPanel = (id, config) => {
    if (panels[id]) {
      console.warn(`Panel with id ${id} already exists`);
      return;
    }

    setPanels(prev => ({
      ...prev,
      [id]: {
        id,
        title: config.title || id,
        position: config.position || { x: 100, y: 100 },
        size: config.size || { width: 300, height: 400 },
        isOpen: true,
        isCollapsed: false,
        isDocked: false,
        zIndex: Math.max(...Object.values(prev).map(panel => panel.zIndex || 0)) + 1,
        ...config
      }
    }));
  };

  return (
    <PanelContext.Provider
      value={{
        panels,
        updatePanelPosition,
        updatePanelSize,
        togglePanelOpen,
        updatePanelTitle,
        togglePanelCollapsed,
        dockPanel,
        bringToFront,
        resetPanels,
        activatePanelInGroup,
        applyLayout,
        createPanel,
        layoutPresets
      }}
    >
      {children}
    </PanelContext.Provider>
  );
};

export const usePanel = () => {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanel must be used within a PanelProvider');
  }
  return context;
};