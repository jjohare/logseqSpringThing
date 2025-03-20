import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { useSettingsStore } from '../stores/settings-store';
import { createLogger, createErrorMetadata } from '../utils/logger';
import { LabelSettings } from '../types/settings';

const logger = createLogger('TextRenderer');

export interface LabelData {
  id: string;
  text: string;
  position: THREE.Vector3;
}

interface TextRendererProps {
  labels?: LabelData[];
}

export const TextRenderer: React.FC<TextRendererProps> = ({ labels = [] }) => {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const settings = useSettingsStore(state => state.settings?.visualization?.labels);
  
  if (!settings || !settings.enabled) {
    return null;
  }

  return (
    <group ref={groupRef}>
      {labels.map((label) => (
        <Label 
          key={label.id}
          text={label.text}
          position={label.position}
          settings={settings}
        />
      ))}
    </group>
  );
};

interface LabelProps {
  text: string;
  position: THREE.Vector3;
  settings: LabelSettings;
}

const Label: React.FC<LabelProps> = ({ text, position, settings }) => {
  // Skip rendering empty labels
  if (!text.trim()) return null;
  
  const textColor = settings.color;
  const fontSize = settings.size;
  const showDistance = settings.showDistance || 0;
  const fadeDistance = settings.fadeDistance || 0;
  const backgroundColor = settings.backgroundColor;
  
  // Calculate distance to camera to handle fade effect
  const { camera } = useThree();
  const [opacity, setOpacity] = useState(1);
  
  useEffect(() => {
    if (!fadeDistance) return;
    
    const updateOpacity = () => {
      const distance = camera.position.distanceTo(position);
      
      if (distance > fadeDistance) {
        setOpacity(0);
      } else if (distance > showDistance) {
        // Linear fade from showDistance to fadeDistance
        const fadeRatio = 1 - ((distance - showDistance) / (fadeDistance - showDistance));
        setOpacity(Math.max(0, Math.min(1, fadeRatio)));
      } else {
        setOpacity(1);
      }
    };
    
    updateOpacity();
    
    // Add event listener for camera movements
    window.addEventListener('camerachange', updateOpacity);
    return () => {
      window.removeEventListener('camerachange', updateOpacity);
    };
  }, [camera, position, showDistance, fadeDistance]);
  
  // Don't render if fully transparent
  if (opacity <= 0) return null;
  
  return (
    <Billboard
      position={position}
      follow={true}
      lockX={false}
      lockY={false}
      lockZ={false}
    >
      <Text
        fontSize={fontSize}
        color={textColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
        outlineOpacity={0.8}
        overflowWrap="normal"
        maxWidth={10}
        textAlign="center"
        renderOrder={10} // Ensure text renders on top of other objects
        material-depthTest={false} // Make sure text is always visible
        material-transparent={true}
        material-opacity={opacity}
      >
        {text}
        {backgroundColor && (
          <meshBasicMaterial 
            color={backgroundColor} 
            opacity={opacity * 0.7}
            transparent={true}
            side={THREE.DoubleSide}
          />
        )}
      </Text>
    </Billboard>
  );
};

// Class-based implementation that can be used outside React components
export class TextRendererManager {
  private static instance: TextRendererManager;
  private labels: Map<string, LabelData> = new Map();
  private updateCallback: (() => void) | null = null;
  
  private constructor() {
    // Private constructor for singleton
  }
  
  public static getInstance(): TextRendererManager {
    if (!TextRendererManager.instance) {
      TextRendererManager.instance = new TextRendererManager();
    }
    return TextRendererManager.instance;
  }
  
  public setUpdateCallback(callback: () => void): void {
    this.updateCallback = callback;
  }
  
  public updateLabel(id: string, text: string, position: THREE.Vector3, preserveText: boolean = false): void {
    try {
      const existingLabel = this.labels.get(id);
      
      // Skip processing if text is empty but preserveText is true and we already have a label
      if (text.trim() === '' && preserveText && existingLabel) {
        existingLabel.position.copy(position);
        this.triggerUpdate();
        return;
      }
      
      if (!existingLabel) {
        this.labels.set(id, {
          id,
          text: text || '',
          position: position.clone()
        });
      } else {
        // Only update text if non-empty text is provided
        if (text.trim() !== '') {
          existingLabel.text = text;
        }
        // Always update position
        existingLabel.position.copy(position);
      }
      
      this.triggerUpdate();
    } catch (error) {
      logger.error('Error updating label:', createErrorMetadata(error));
    }
  }
  
  public removeLabel(id: string): void {
    try {
      this.labels.delete(id);
      this.triggerUpdate();
    } catch (error) {
      logger.error('Error removing label:', createErrorMetadata(error));
    }
  }
  
  public getAllLabels(): LabelData[] {
    return Array.from(this.labels.values());
  }
  
  public clearLabels(): void {
    this.labels.clear();
    this.triggerUpdate();
  }
  
  private triggerUpdate(): void {
    if (this.updateCallback) {
      this.updateCallback();
    }
  }
}

// Create a hook for using the TextRendererManager in React components
export const useTextRenderer = () => {
  const textRendererManager = useMemo(() => TextRendererManager.getInstance(), []);
  const [labels, setLabels] = useState<LabelData[]>([]);
  
  useEffect(() => {
    textRendererManager.setUpdateCallback(() => {
      setLabels([...textRendererManager.getAllLabels()]);
    });
    
    return () => {
      textRendererManager.setUpdateCallback(null);
    };
  }, [textRendererManager]);
  
  return {
    labels,
    updateLabel: textRendererManager.updateLabel.bind(textRendererManager),
    removeLabel: textRendererManager.removeLabel.bind(textRendererManager),
    clearLabels: textRendererManager.clearLabels.bind(textRendererManager)
  };
};

export default TextRenderer;