"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(
  lang: string = "en-US"
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang;

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        if (final) {
          setTranscript(final);
          setInterimTranscript("");
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech") {
          setIsListening(false);
          return;
        }
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [lang]);

  const start = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript("");
      setInterimTranscript("");
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Failed to start recognition:", e);
      }
    }
  }, [isListening]);

  const stop = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const reset = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    start,
    stop,
    reset,
  };
}

/**
 * Score pronunciation by comparing user's speech with expected text.
 * Returns a score from 0-100 and per-word matching details.
 */
export function scorePronunciation(
  expected: string,
  actual: string
): {
  score: number;
  matchedWords: string[];
  missedWords: string[];
  wordDetails: { word: string; matched: boolean }[];
} {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s']/g, "")
      .split(/\s+/)
      .filter(Boolean);

  const expectedWords = normalize(expected);
  const actualWords = normalize(actual);

  const wordDetails = expectedWords.map((word) => {
    const matched = actualWords.some(
      (aw) =>
        aw === word ||
        levenshteinDistance(aw, word) <= Math.max(1, Math.floor(word.length * 0.3))
    );
    return { word, matched };
  });

  const matchedWords = wordDetails.filter((w) => w.matched).map((w) => w.word);
  const missedWords = wordDetails.filter((w) => !w.matched).map((w) => w.word);
  const score =
    expectedWords.length > 0
      ? Math.round((matchedWords.length / expectedWords.length) * 100)
      : 0;

  return { score, matchedWords, missedWords, wordDetails };
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}
