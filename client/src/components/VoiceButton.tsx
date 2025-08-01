import React, { useState, useEffect } from 'react';
import { useVoiceInteraction } from '../hooks/useVoiceInteraction';
import { VoiceWebSocketService } from '../services/VoiceWebSocketService';
import { AudioInputService } from '../services/AudioInputService';

// Simple icon components to avoid lucide-react import issues
const MicIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const MicOffIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12L9 9z" />
    <path d="M12 1a3 3 0 0 0-3 3v8.5l6-6V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-.64 3.07L21 17.5A9 9 0 0 0 19 10z" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const VolumeIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5,6 9,2 9,2 15,6 15,11 19,11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

export interface VoiceButtonProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost';
}

export const VoiceButton: React.FC<VoiceButtonProps> = ({
  className = '',
  size = 'md',
  variant = 'primary'
}) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  const {
    isListening,
    isSpeaking,
    toggleListening
  } = useVoiceInteraction({
    onError: (error) => {
      console.error('Voice interaction error:', error);
      setHasError(true);
    }
  });

  // Check browser support on mount
  useEffect(() => {
    const support = AudioInputService.getBrowserSupport();
    const supported = support.getUserMedia && support.audioContext && support.isHttps && support.mediaRecorder;
    setIsSupported(supported);
  }, []);

  // Get audio level from VoiceWebSocketService directly for visual feedback
  useEffect(() => {
    const voiceService = VoiceWebSocketService.getInstance();
    const handleAudioLevel = (level: number) => setAudioLevel(level);
    const audioInput = voiceService.getAudioInput();

    audioInput.on('audioLevel', handleAudioLevel);

    return () => {
      audioInput.off('audioLevel', handleAudioLevel);
    };
  }, []);

  // Clear error when listening state changes
  useEffect(() => {
    if (isListening && hasError) {
      setHasError(false);
    }
  }, [isListening, hasError]);

  const handleToggle = async () => {
    if (!isSupported) {
      setHasError(true);
      console.error('Voice features not supported in this browser/environment');
      return;
    }

    try {
      setHasError(false);
      await toggleListening();
    } catch (error) {
      console.error('Failed to toggle voice input:', error);
      setHasError(true);
    }
  };

  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12'
  };

  const variantClasses = {
    primary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    secondary: 'bg-secondary hover:bg-secondary/90 text-secondary-foreground',
    ghost: 'hover:bg-accent text-accent-foreground'
  };

  const buttonClasses = `
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${className}
    relative flex items-center justify-center
    rounded-full transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
    ${isListening ? 'ring-2 ring-destructive' : ''}
  `;

  return (
    <button
      onClick={handleToggle}
      className={buttonClasses}
      aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
    >
      {/* Audio level indicator */}
      {isListening && (
        <div
          className="absolute inset-0 rounded-full bg-destructive opacity-30 animate-pulse"
          style={{
            transform: `scale(${1 + audioLevel * 0.5})`,
            transition: 'transform 100ms ease-out'
          }}
        />
      )}

      {/* Icon */}
      {isSpeaking ? (
        <VolumeIcon className="w-5 h-5" />
      ) : isListening ? (
        <MicIcon className="w-5 h-5" />
      ) : (
        <MicOffIcon className="w-5 h-5" />
      )}
    </button>
  );
};