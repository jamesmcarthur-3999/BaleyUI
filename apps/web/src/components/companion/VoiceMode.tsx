'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  MicOff,
  Volume2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

// ============================================================================
// WEB SPEECH API TYPES
// ============================================================================

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// ============================================================================
// TYPES
// ============================================================================

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export interface VoiceConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  voiceId?: string;
  rate?: number;
  pitch?: number;
}

export interface VoiceTranscript {
  text: string;
  isFinal: boolean;
  confidence?: number;
}

interface VoiceModeProps {
  onTranscript?: (transcript: VoiceTranscript) => void;
  onSpeakEnd?: () => void;
  config?: VoiceConfig;
  className?: string;
}

// ============================================================================
// AUDIO VISUALIZER
// ============================================================================

function AudioVisualizer({
  isActive,
  levels,
}: {
  isActive: boolean;
  levels: number[];
}) {
  const defaultLevels = [0.3, 0.5, 0.8, 0.6, 0.4, 0.7, 0.5, 0.3];
  const displayLevels = isActive ? levels : defaultLevels.map(() => 0.1);

  return (
    <div className="flex items-center justify-center gap-0.5 h-8">
      {displayLevels.map((level, i) => (
        <div
          key={i}
          className={cn(
            'w-1 rounded-full transition-all duration-75',
            isActive ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
          style={{
            height: `${Math.max(4, level * 32)}px`,
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================================
// VOICE BUTTON
// ============================================================================

function VoiceButton({
  state,
  onToggle,
  disabled,
}: {
  state: VoiceState;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const stateConfig: Record<
    VoiceState,
    { icon: typeof Mic; color: string; label: string }
  > = {
    idle: { icon: Mic, color: 'bg-muted hover:bg-muted/80', label: 'Start listening' },
    listening: { icon: MicOff, color: 'bg-red-500 hover:bg-red-600 text-white', label: 'Stop listening' },
    processing: { icon: Loader2, color: 'bg-primary text-primary-foreground', label: 'Processing...' },
    speaking: { icon: Volume2, color: 'bg-blue-500 hover:bg-blue-600 text-white', label: 'Speaking...' },
    error: { icon: AlertCircle, color: 'bg-destructive text-destructive-foreground', label: 'Error' },
  };

  const { icon: Icon, color, label } = stateConfig[state];
  const isAnimating = state === 'processing';

  return (
    <Button
      size="lg"
      className={cn(
        'h-16 w-16 rounded-full',
        color,
        'transition-all duration-200'
      )}
      onClick={onToggle}
      disabled={disabled || state === 'processing'}
      title={label}
    >
      <Icon
        className={cn('h-6 w-6', isAnimating && 'animate-spin')}
      />
    </Button>
  );
}

// ============================================================================
// TRANSCRIPT DISPLAY
// ============================================================================

function TranscriptDisplay({
  transcript,
  isInterim,
}: {
  transcript: string;
  isInterim: boolean;
}) {
  if (!transcript) return null;

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg text-center',
        isInterim ? 'bg-muted/50 text-muted-foreground' : 'bg-muted'
      )}
    >
      <p className="text-sm">{transcript}</p>
      {isInterim && (
        <p className="text-xs text-muted-foreground mt-1">Listening...</p>
      )}
    </div>
  );
}

// ============================================================================
// GET SPEECH RECOGNITION
// ============================================================================

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

// ============================================================================
// VOICE MODE HOOK
// ============================================================================

export function useVoiceMode(config?: VoiceConfig) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Speech recognition not supported in this browser');
    }
    synthRef.current = window.speechSynthesis;
  }, []);

  // Initialize audio analyzer for visualizer
  const initAudioAnalyzer = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 32;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateLevels = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const levels = Array.from(dataArray.slice(0, 8)).map((v) => v / 255);
        setAudioLevels(levels);
        animationRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();
    } catch (err) {
      console.error('Failed to initialize audio analyzer:', err);
    }
  };

  // Clean up audio analyzer
  const cleanupAudioAnalyzer = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevels([]);
  };

  // Start listening
  const startListening = () => {
    if (!isSupported) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();

    recognition.continuous = config?.continuous ?? false;
    recognition.interimResults = config?.interimResults ?? true;
    recognition.lang = config?.language ?? 'en-US';

    recognition.onstart = () => {
      setState('listening');
      setError(null);
      initAudioAnalyzer();
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result || !result[0]) continue;

        const transcriptText = result[0].transcript;
        if (result.isFinal) {
          final += transcriptText;
        } else {
          interim += transcriptText;
        }
      }

      if (final) {
        setTranscript((prev) => prev + final);
        setInterimTranscript('');
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setState('error');
      setError(event.error);
      cleanupAudioAnalyzer();
    };

    recognition.onend = () => {
      setState('idle');
      cleanupAudioAnalyzer();
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    cleanupAudioAnalyzer();
  };

  // Speak text
  const speak = (text: string) => {
    if (!synthRef.current) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = config?.rate ?? 1;
    utterance.pitch = config?.pitch ?? 1;

    utterance.onstart = () => setState('speaking');
    utterance.onend = () => setState('idle');
    utterance.onerror = () => {
      setState('error');
      setError('Speech synthesis failed');
    };

    synthRef.current.speak(utterance);
  };

  // Stop speaking
  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setState('idle');
    }
  };

  // Toggle listening
  const toggle = () => {
    if (state === 'listening') {
      stopListening();
    } else if (state === 'speaking') {
      stopSpeaking();
    } else {
      startListening();
    }
  };

  // Clear transcript
  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
  };

  return {
    state,
    transcript,
    interimTranscript,
    audioLevels,
    error,
    isSupported,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggle,
    clearTranscript,
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VoiceMode({
  onTranscript,
  onSpeakEnd,
  config,
  className,
}: VoiceModeProps) {
  const {
    state,
    transcript,
    interimTranscript,
    audioLevels,
    error,
    isSupported,
    toggle,
    clearTranscript,
  } = useVoiceMode(config);

  // Notify parent of transcript changes
  useEffect(() => {
    if (transcript && onTranscript) {
      onTranscript({ text: transcript, isFinal: true });
    }
  }, [transcript, onTranscript]);

  useEffect(() => {
    if (interimTranscript && onTranscript) {
      onTranscript({ text: interimTranscript, isFinal: false });
    }
  }, [interimTranscript, onTranscript]);

  // Notify parent when speaking ends
  useEffect(() => {
    if (state === 'idle' && onSpeakEnd) {
      onSpeakEnd();
    }
  }, [state, onSpeakEnd]);

  if (!isSupported) {
    return (
      <div className={cn('text-center p-4', className)}>
        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Voice mode is not supported in this browser
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center gap-4 p-4', className)}>
      {/* Status badge */}
      <Badge
        variant={state === 'error' ? 'destructive' : 'secondary'}
        className="capitalize"
      >
        {state === 'idle' ? 'Ready' : state}
      </Badge>

      {/* Audio visualizer */}
      <AudioVisualizer isActive={state === 'listening'} levels={audioLevels} />

      {/* Voice button */}
      <VoiceButton state={state} onToggle={toggle} />

      {/* Transcript display */}
      <TranscriptDisplay
        transcript={transcript || interimTranscript}
        isInterim={!transcript && !!interimTranscript}
      />

      {/* Error display */}
      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      {/* Clear button */}
      {transcript && (
        <Button variant="ghost" size="sm" onClick={clearTranscript}>
          Clear
        </Button>
      )}

      {/* Help text */}
      <p className="text-xs text-muted-foreground text-center">
        {state === 'idle'
          ? 'Click the microphone to start speaking'
          : state === 'listening'
            ? 'Listening... Click again to stop'
            : 'Processing your voice...'}
      </p>
    </div>
  );
}
