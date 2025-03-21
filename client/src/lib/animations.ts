/**
 * Animation System
 * 
 * This file provides animation utilities and presets for UI components.
 * It's designed to create consistent animations throughout the application.
 */

import { useEffect, useState } from 'react';

// Common timing curves (easing functions)
export const timingFunctions = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  // Custom spring-like curve for natural motion
  spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  // Bounce effect
  bounce: 'cubic-bezier(0.175, 0.885, 0.32, 1.5)',
};

// Animation timing presets (in milliseconds)
export const timingPresets = {
  fast: 150,
  normal: 250, 
  slow: 350,
  verySlow: 500,
};

// Animation variants for different UI elements
export const animationVariants = {
  // Fade animations
  fade: {
    in: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
    out: {
      from: { opacity: 1 },
      to: { opacity: 0 },
    },
  },
  
  // Slide animations
  slideUp: {
    in: {
      from: { transform: 'translateY(10px)', opacity: 0 },
      to: { transform: 'translateY(0)', opacity: 1 },
    },
    out: {
      from: { transform: 'translateY(0)', opacity: 1 },
      to: { transform: 'translateY(-10px)', opacity: 0 },
    },
  },
  
  slideDown: {
    in: {
      from: { transform: 'translateY(-10px)', opacity: 0 },
      to: { transform: 'translateY(0)', opacity: 1 },
    },
    out: {
      from: { transform: 'translateY(0)', opacity: 1 },
      to: { transform: 'translateY(10px)', opacity: 0 },
    },
  },
  
  slideLeft: {
    in: {
      from: { transform: 'translateX(10px)', opacity: 0 },
      to: { transform: 'translateX(0)', opacity: 1 },
    },
    out: {
      from: { transform: 'translateX(0)', opacity: 1 },
      to: { transform: 'translateX(-10px)', opacity: 0 },
    },
  },
  
  slideRight: {
    in: {
      from: { transform: 'translateX(-10px)', opacity: 0 },
      to: { transform: 'translateX(0)', opacity: 1 },
    },
    out: {
      from: { transform: 'translateX(0)', opacity: 1 },
      to: { transform: 'translateX(10px)', opacity: 0 },
    },
  },
  
  // Scale animations
  scale: {
    in: {
      from: { transform: 'scale(0.95)', opacity: 0 },
      to: { transform: 'scale(1)', opacity: 1 },
    },
    out: {
      from: { transform: 'scale(1)', opacity: 1 },
      to: { transform: 'scale(0.95)', opacity: 0 },
    },
  },
  
  // Panel animations
  panel: {
    in: {
      from: { transform: 'translateX(100%)', opacity: 0 },
      to: { transform: 'translateX(0)', opacity: 1 },
    },
    out: {
      from: { transform: 'translateX(0)', opacity: 1 },
      to: { transform: 'translateX(100%)', opacity: 0 },
    },
  },
  
  // Shake animation for error or attention
  shake: {
    keyframes: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(0)' }
    ],
  },
};

/**
 * CSS transition string creator for inline styles
 * @param properties CSS properties to animate
 * @param duration Animation duration in ms
 * @param timingFunction Easing function
 * @param delay Delay before animation starts (in ms)
 * @returns CSS transition string
 */
export function createTransition(
  properties: string[] = ['all'],
  duration: number = timingPresets.normal,
  timingFunction: string = timingFunctions.easeInOut,
  delay: number = 0
): string {
  return properties
    .map(prop => `${prop} ${duration}ms ${timingFunction} ${delay}ms`)
    .join(', ');
}

/**
 * Hook to create animated transitions on mount/unmount
 * @param visible Whether the element is visible
 * @param duration Animation duration in ms
 * @param delay Delay before animation starts (in ms)
 * @returns Whether to render the element at all
 */
export function useAnimatedVisibility(
  visible: boolean,
  duration: number = timingPresets.normal,
  delay: number = 0
): { shouldRender: boolean; animationState: 'entering' | 'entered' | 'exiting' | 'exited' } {
  const [shouldRender, setShouldRender] = useState(visible);
  const [animationState, setAnimationState] = useState<'entering' | 'entered' | 'exiting' | 'exited'>(
    visible ? 'entered' : 'exited'
  );
  
  useEffect(() => {
    let timeoutId: number;
    
    if (visible) {
      setShouldRender(true);
      // Wait one frame to trigger enter animation
      requestAnimationFrame(() => {
        setAnimationState('entering');
        timeoutId = window.setTimeout(() => {
          setAnimationState('entered');
        }, duration);
      });
    } else {
      setAnimationState('exiting');
      timeoutId = window.setTimeout(() => {
        setAnimationState('exited');
        setShouldRender(false);
      }, duration);
    }
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [visible, duration]);
  
  return { shouldRender, animationState };
}

/**
 * Hook to perform performance-aware animations
 * Reduces animation complexity on low-end devices
 */
export function usePerformanceAwareAnimation(
  preferredAnimation: 'fade' | 'slide' | 'scale' | 'none' = 'fade'
): 'fade' | 'slide' | 'scale' | 'none' {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lowPerformance, setLowPerformance] = useState(false);
  
  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    
    // Detect low performance devices (simple heuristic)
    if (
      navigator.hardwareConcurrency <= 2 || // CPU cores      
      ('deviceMemory' in navigator && (navigator as any).deviceMemory <= 2) // RAM in GB, not available in all browsers
    ) {
      // Set low performance mode to reduce animations and effects
      setLowPerformance(true);
    }
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);
  
  // Return appropriate animation based on device capabilities
  if (reducedMotion) return 'none';
  if (lowPerformance) return 'fade'; // Simplest animation for low-end devices
  return preferredAnimation;
}