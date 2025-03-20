import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ChevronDown, ChevronUp, Minimize, Maximize } from 'lucide-react'
import { Button } from './ui/button'
import { SettingsSectionProps } from './types'
import { SettingsSubsection } from './SettingsSubsection'
// Fix the import for react-draggable (it doesn't export useDrag)
import Draggable from 'react-draggable'
import { useControlPanelContext } from './control-panel-context'

export function SettingsSection({ id, title, settings, advanced = false }: SettingsSectionProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [isDetached, setIsDetached] = useState(false)
  const { advancedMode } = useControlPanelContext()
  
  // If advanced section and not in advanced mode, don't render
  if (advanced && !advancedMode) {
    return null
  }

  // Split settings into subsections
  const subsections = Object.entries(settings).map(([key, subsection]) => ({
    key,
    title: key,
    settings: subsection,
    path: `${id}.${key}`
  }))

  const handleDetach = () => {
    setIsDetached(!isDetached)
  }

  if (isDetached) {
    return (
      <DetachedSection 
        title={title} 
        onReattach={handleDetach}
        sectionId={id}
      >
        <div className="space-y-4 p-2">
          {subsections.map(subsection => (
            <SettingsSubsection
              key={subsection.key}
              title={subsection.title}
              settings={subsection.settings}
              path={subsection.path}
            />
          ))}
        </div>
      </DetachedSection>
    )
  }

  return (
    <Card className="settings-section">
      <CardHeader className="py-2 px-4">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 p-0">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                {isOpen ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={handleDetach}
              title="Detach section"
            >
              <Maximize className="h-3 w-3" />
            </Button>
          </div>
          
          <CollapsibleContent>
            <CardContent className="p-2 pt-2">
              <div className="space-y-4">
                {subsections.map(subsection => (
                  <SettingsSubsection
                    key={subsection.key}
                    title={subsection.title}
                    settings={subsection.settings}
                    path={subsection.path}
                  />
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </CardHeader>
    </Card>
  )
}

// Detached floating section component
function DetachedSection({ 
  children, 
  title, 
  onReattach,
  sectionId
}: { 
  children: React.ReactNode;
  title: string;
  onReattach: () => void;
  sectionId: string;
}) {
  const [position, setPosition] = useState({ x: 100, y: 100 })
  
  const handleDrag = (e: any, data: { x: number; y: number }) => {
    setPosition({ x: data.x, y: data.y })
  }

  return (
    <div 
      className="detached-panel absolute z-50 min-w-[250px]"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
      }}
      data-section-id={sectionId}
    >
      <div className="flex items-center justify-between border-b border-border p-2">
        <div className="cursor-move flex-1 text-sm font-medium">
          {title}
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6"
          onClick={onReattach}
          title="Reattach section"
        >
          <Minimize className="h-3 w-3" />
        </Button>
      </div>
      <div className="p-2">
        {children}
      </div>
    </div>
  )
}