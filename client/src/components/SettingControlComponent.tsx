import { useState } from 'react'
import { SettingControlProps } from './types'
import { SettingValue } from './types'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Tooltip, TooltipProvider } from './ui/tooltip'
import { Info } from 'lucide-react'

export function SettingControlComponent({ path, setting, value, onChange }: SettingControlProps) {
  // Format array values for display in inputs
  const [inputValue, setInputValue] = useState<string>(() => {
    if (Array.isArray(value)) {
      return value.join(', ')
    }
    return String(value ?? '')
  })

  // Handler for input changes (for debouncing text/number inputs)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }

  // Apply input value on blur or Enter key
  const handleInputBlur = () => {
    applyInputValue()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      applyInputValue()
    }
  }

  // Apply the current input value to the setting
  const applyInputValue = () => {
    switch (setting.type) {
      case 'number':
        onChange(parseFloat(inputValue))
        break
      case 'text':
        // Handle array values like "1, 2, 3" -> [1, 2, 3]
        if (Array.isArray(value)) {
          const items = inputValue.split(',').map(item => item.trim())
          
          // Convert to numbers if the original value was numeric
          if (value.every(item => typeof item === 'number')) {
            onChange(items.map(item => parseFloat(item)))
          } else {
            onChange(items)
          }
        } else {
          onChange(inputValue)
        }
        break
    }
  }

  // Render appropriate control based on setting type
  const renderControl = () => {
    switch (setting.type) {
      case 'slider':
        return (
          <div className="flex w-full flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-xs">{setting.min ?? 0}</span>
              <span className="text-xs">{value}</span>
              <span className="text-xs">{setting.max ?? 1}</span>
            </div>
            <Slider
              value={[value as number]}
              min={setting.min ?? 0}
              max={setting.max ?? 1}
              step={setting.step ?? 0.1}
              onValueChange={([val]) => onChange(val)}
            />
          </div>
        )

      case 'toggle':
        return (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={onChange}
          />
        )

      case 'color':
        return (
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-12 cursor-pointer p-0"
            />
            <Input
              type="text"
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 w-24"
            />
          </div>
        )

      case 'select':
        return (
          <Select 
            value={value as string} 
            onValueChange={onChange}
          >
            <SelectTrigger className="h-8 w-full">
              <SelectValue placeholder="Select option" />
            </SelectTrigger>
            <SelectContent>
              {setting.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'number':
        return (
          <Input
            type="number"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            min={setting.min}
            max={setting.max}
            step={setting.step ?? 1}
            className="h-8 w-full"
          />
        )

      case 'text':
      default:
        return (
          <Input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            className="h-8 w-full"
          />
        )
    }
  }

  return (
    <div className="setting-control flex items-center justify-between gap-4 py-1.5">
      <div className="flex items-center gap-1">
        <Label htmlFor={path} className="text-sm">
          {setting.label}
        </Label>
        
        {setting.tooltip && (
          <TooltipProvider>
            <Tooltip content={setting.tooltip}>
              <Info className="h-3 w-3 text-muted-foreground" />
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      <div className="flex-shrink-0">
        {renderControl()}
      </div>
    </div>
  )
}