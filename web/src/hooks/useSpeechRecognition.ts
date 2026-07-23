"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

interface SpeechAlternative {
  confidence: number;
  transcript: string;
}

interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechAlternative;
}

interface SpeechResultList {
  readonly length: number;
  readonly [index: number]: SpeechResult;
}

interface SpeechResultEvent {
  readonly results: SpeechResultList;
}

interface SpeechErrorEvent {
  readonly error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface UseSpeechRecognitionReturn {
  error: string | null;
  interimTranscript: string;
  isListening: boolean;
  isSupported: boolean;
  reset: () => void;
  start: () => void;
  stop: () => void;
  transcript: string;
}

const SILENCE_TIMEOUT_MS = 60_000;
const subscribeToBrowserCapability = () => () => undefined;

function getSpeechRecognitionConstructor():
  | SpeechRecognitionConstructor
  | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as SpeechWindow;
  return (
    speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
  );
}

function speechRecognitionIsSupported(): boolean {
  return Boolean(getSpeechRecognitionConstructor());
}

function speechErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was denied. Allow microphone access and try again.";
    case "audio-capture":
      return "No working microphone was found.";
    case "network":
      return "Speech recognition is unavailable because of a network error.";
    default:
      return "Speech recognition stopped unexpectedly. Please try again.";
  }
}

export function useSpeechRecognition(
  lang: string = "en-US"
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isSupported = useSyncExternalStore(
    subscribeToBrowserCapability,
    speechRecognitionIsSupported,
    () => false
  );

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const intentionalStopRef = useRef(false);
  const accumulatedRef = useRef("");
  const currentSessionFinalRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(false);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      intentionalStopRef.current = true;
      if (recognitionRef.current && isActiveRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // The browser already stopped this session.
        }
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let interim = "";
      let sessionFinal = "";

      for (let resultIndex = 0; resultIndex < event.results.length; resultIndex++) {
        const result = event.results[resultIndex];
        let bestAlternative = result[0];

        for (
          let alternativeIndex = 1;
          alternativeIndex < result.length;
          alternativeIndex++
        ) {
          if (
            result[alternativeIndex].confidence > bestAlternative.confidence
          ) {
            bestAlternative = result[alternativeIndex];
          }
        }

        if (result.isFinal) {
          sessionFinal += bestAlternative.transcript;
        } else {
          interim += bestAlternative.transcript;
        }
      }

      currentSessionFinalRef.current = sessionFinal;
      const prefix = accumulatedRef.current;
      const separator = prefix && sessionFinal && !prefix.endsWith(" ") ? " " : "";
      const fullFinal = prefix + separator + sessionFinal;
      const interimSeparator =
        fullFinal && interim && !fullFinal.endsWith(" ") ? " " : "";

      setInterimTranscript(fullFinal + interimSeparator + interim);
      resetSilenceTimer();
    };

    recognition.onend = () => {
      isActiveRef.current = false;

      if (currentSessionFinalRef.current) {
        const prefix = accumulatedRef.current;
        const separator = prefix && !prefix.endsWith(" ") ? " " : "";
        accumulatedRef.current = (
          prefix +
          separator +
          currentSessionFinalRef.current
        ).trim();
        currentSessionFinalRef.current = "";
      }

      if (intentionalStopRef.current) {
        setIsListening(false);
        clearSilenceTimer();
        setTranscript(accumulatedRef.current.trim());
        setInterimTranscript("");
        return;
      }

      try {
        recognition.start();
        isActiveRef.current = true;
      } catch {
        setIsListening(false);
        clearSilenceTimer();
        setTranscript(accumulatedRef.current.trim());
        setInterimTranscript("");
        setError("Speech recognition stopped unexpectedly. Please try again.");
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      intentionalStopRef.current = true;
      setError(speechErrorMessage(event.error));
    };

    recognitionRef.current = recognition;

    return () => {
      intentionalStopRef.current = true;
      clearSilenceTimer();
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch {
        // The recognition session was not active.
      }
      recognitionRef.current = null;
      isActiveRef.current = false;
    };
  }, [clearSilenceTimer, lang, resetSilenceTimer]);

  const start = useCallback(() => {
    if (!recognitionRef.current) {
      setError("Speech recognition is not supported by this browser.");
      return;
    }
    if (isActiveRef.current) return;

    accumulatedRef.current = "";
    currentSessionFinalRef.current = "";
    intentionalStopRef.current = false;
    setError(null);
    setTranscript("");
    setInterimTranscript("");

    try {
      recognitionRef.current.start();
      isActiveRef.current = true;
      setIsListening(true);
      resetSilenceTimer();
    } catch {
      setError("Could not start speech recognition. Please try again.");
      setIsListening(false);
    }
  }, [resetSilenceTimer]);

  const stop = useCallback(() => {
    intentionalStopRef.current = true;
    clearSilenceTimer();

    if (currentSessionFinalRef.current) {
      const prefix = accumulatedRef.current;
      const separator = prefix && !prefix.endsWith(" ") ? " " : "";
      accumulatedRef.current = (
        prefix +
        separator +
        currentSessionFinalRef.current
      ).trim();
      currentSessionFinalRef.current = "";
    }

    if (recognitionRef.current && isActiveRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        isActiveRef.current = false;
      }
      return;
    }

    setIsListening(false);
    setTranscript(accumulatedRef.current.trim());
    setInterimTranscript("");
  }, [clearSilenceTimer]);

  const reset = useCallback(() => {
    accumulatedRef.current = "";
    currentSessionFinalRef.current = "";
    setError(null);
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    error,
    interimTranscript,
    isListening,
    isSupported,
    reset,
    start,
    stop,
    transcript,
  };
}

export { scoreSpeechAccuracy } from "@/lib/speechScoring";
export type { SpeechAccuracyResult } from "@/lib/speechScoring";
