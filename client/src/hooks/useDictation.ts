import { noteActivity } from '../services/activity.js';
import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionAlternative { transcript: string; confidence: number; }
interface SpeechRecognitionResult { isFinal: boolean; length: number; [i: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionResultList { length: number; [i: number]: SpeechRecognitionResult; }
interface SpeechRecognitionEvent extends Event { resultIndex: number; results: SpeechRecognitionResultList; }
interface SpeechRecognitionErrorEvent extends Event { error: string; }
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface UseDictationOptions {
  onFinalResult: (text: string) => void;
  lang?: string;
}

interface UseDictationReturn {
  isSupported: boolean;
  isListening: boolean;
  interimText: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
}

export function useDictation({ onFinalResult, lang = 'en-US' }: UseDictationOptions): UseDictationReturn {
  const Ctor = getSpeechRecognitionCtor();
  const isSupported = Ctor !== null;

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Ref tracks the desired listening state so onend callback avoids stale closures
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Keep onFinalResult current without re-creating the recognition instance
  const onFinalResultRef = useRef(onFinalResult);
  onFinalResultRef.current = onFinalResult;

  useEffect(() => {
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Words arriving are someone being here (no key or pointer says so while dictating)
      noteActivity();
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onFinalResultRef.current(text);
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
    };

    // onend fires on silence, on iOS 60s cap, and on explicit stop().
    // Auto-restart when the user hasn't stopped intentionally.
    recognition.onend = () => {
      setInterimText('');
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // Race: already starting. Ignore.
        }
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        setError('Mic access denied — check browser or OS settings');
        isListeningRef.current = false;
        setIsListening(false);
      } else if (event.error === 'network') {
        setError('Dictation requires an internet connection on this device');
        isListeningRef.current = false;
        setIsListening(false);
      }
      // 'aborted' and 'no-speech' are non-fatal; onend will handle restart
    };

    recognitionRef.current = recognition;

    return () => {
      isListeningRef.current = false;
      try { recognition.stop(); } catch { /* ignore */ }
    };
  }, [Ctor, lang]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    isListeningRef.current = true;
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      // Already started (shouldn't happen on first call)
    }
  }, []);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimText('');
    try {
      recognitionRef.current?.stop();
    } catch { /* ignore */ }
  }, []);

  return { isSupported, isListening, interimText, error, startListening, stopListening };
}
