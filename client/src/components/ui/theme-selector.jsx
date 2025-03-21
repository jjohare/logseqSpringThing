import React, { useState } from 'react';
import { useTheme } from './theme-provider';
import { Button } from './button';
import { 
  Sun, 
  Moon, 
  Monitor, 
  Palette, 
  Check, 
  EyeOff,
  Droplet,
  Leaf,
  Waves
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';

const ThemeSelector = () => {
  const { 
    theme, 
    setTheme, 
    customColors, 
    setCustomColor, 
    themePresets, 
    applyThemePreset 
  } = useTheme();
  
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeColor, setActiveColor] = useState('primary');
  
  const colorOptions = [
    { name: 'primary', label: 'Primary' },
    { name: 'secondary', label: 'Secondary' },
    { name: 'background', label: 'Background' },
    { name: 'foreground', label: 'Foreground' },
    { name: 'accent', label: 'Accent' },
    { name: 'muted', label: 'Muted' },
    { name: 'border', label: 'Border' },
  ];
  
  const handleColorChange = (color) => {
    setCustomColor(activeColor, color);
  };
  
  const resetCustomColors = () => {
    colorOptions.forEach(option => {
      setCustomColor(option.name, null);
    });
    setShowColorPicker(false);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-2">
        <h3 className="text-sm font-medium">Theme</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={theme === 'light' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('light')}
            className="flex items-center"
          >
            <Sun className="h-4 w-4 mr-1" />
            Light
            {theme === 'light' && <Check className="h-3 w-3 ml-1" />}
          </Button>
          
          <Button
            variant={theme === 'dark' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('dark')}
            className="flex items-center"
          >
            <Moon className="h-4 w-4 mr-1" />
            Dark
            {theme === 'dark' && <Check className="h-3 w-3 ml-1" />}
          </Button>
          
          <Button
            variant={theme === 'system' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTheme('system')}
            className="flex items-center"
          >
            <Monitor className="h-4 w-4 mr-1" />
            System
            {theme === 'system' && <Check className="h-3 w-3 ml-1" />}
          </Button>
        </div>
      </div>
      
      <div className="flex flex-col space-y-2">
        <h3 className="text-sm font-medium">Theme Presets</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={theme === 'contrast' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyThemePreset('contrast')}
            className="flex items-center"
          >
            <EyeOff className="h-4 w-4 mr-1" />
            Contrast
            {theme === 'contrast' && <Check className="h-3 w-3 ml-1" />}
          </Button>
          
          <Button
            variant={theme === 'cyberpunk' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyThemePreset('cyberpunk')}
            className="flex items-center"
          >
            <Droplet className="h-4 w-4 mr-1" />
            Cyberpunk
            {theme === 'cyberpunk' && <Check className="h-3 w-3 ml-1" />}
          </Button>
          
          <Button
            variant={theme === 'forest' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyThemePreset('forest')}
            className="flex items-center"
          >
            <Leaf className="h-4 w-4 mr-1" />
            Forest
            {theme === 'forest' && <Check className="h-3 w-3 ml-1" />}
          </Button>
          
          <Button
            variant={theme === 'ocean' ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyThemePreset('ocean')}
            className="flex items-center"
          >
            <Waves className="h-4 w-4 mr-1" />
            Ocean
            {theme === 'ocean' && <Check className="h-3 w-3 ml-1" />}
          </Button>
        </div>
      </div>
      
      <div className="flex flex-col space-y-2">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium">Customize Colors</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="flex items-center"
          >
            <Palette className="h-4 w-4 mr-1" />
            {showColorPicker ? 'Hide' : 'Show'}
          </Button>
        </div>
        
        {showColorPicker && (
          <div className="space-y-4 p-4 border border-border rounded-md">
            <div className="flex flex-wrap gap-2">
              {colorOptions.map(option => (
                <Button
                  key={option.name}
                  variant={activeColor === option.name ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveColor(option.name)}
                  className="flex items-center"
                  style={{
                    backgroundColor: activeColor === option.name ? 
                      (customColors[option.name] || `var(--${option.name})`) : undefined,
                    color: activeColor === option.name && option.name === 'background' ? 
                      'var(--foreground)' : undefined
                  }}
                >
                  {option.label}
                </Button>
              ))}
              
              <Button
                variant="outline"
                size="sm"
                onClick={resetCustomColors}
                className="flex items-center ml-auto"
              >
                Reset
              </Button>
            </div>
            
            <div className="flex justify-center">
              <HexColorPicker 
                color={customColors[activeColor] || getComputedStyle(document.documentElement).getPropertyValue(`--${activeColor}`).trim()} 
                onChange={handleColorChange} 
              />
            </div>
            
            <div className="flex justify-between items-center">
              <div className="text-sm">
                Current: <span className="font-mono">{customColors[activeColor] || 'Default'}</span>
              </div>
              <div 
                className="w-6 h-6 rounded-full border border-border" 
                style={{ backgroundColor: customColors[activeColor] || `var(--${activeColor})` }}
              />
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-4 p-3 bg-muted rounded-md">
        <div className="text-sm text-muted-foreground">
          Theme changes are saved automatically and will persist between sessions.
        </div>
      </div>
    </div>
  );
};

export default ThemeSelector;