"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Robust Speech-to-Text hook using Web Speech API.
 *
 * Key design choices:
 * - `continuous = true` so the browser does NOT auto-stop after a single
 *   utterance or short pause.  The user explicitly presses "Stop" when done.
 * - `interimResults = true` to give live visual feedback while speaking.
 * - `maxAlternatives = 3` to pick the highest-confidence result.
 * - An automatic silence-timeout of SILENCE_TIMEOUT_MS restarts recognition
 *   (under the hood) if the browser engine fires `onend` prematurely due to
 *   an extended pause.  This is critical on Chrome, which silently kills the
 *   recognition session after ~5-15 s of silence even in continuous mode.
 * - All accumulated final segments are concatenated so nothing is lost when
 *   the engine decides to finalize a partial phrase mid-sentence.
 */

const SILENCE_TIMEOUT_MS = 60_000; // keep alive for up to 60 s of total silence

export function useSpeechRecognition(
  lang: string = "en-US"
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  // Tracks whether the user explicitly asked to stop (vs the browser killing
  // the session on its own, which we want to recover from).
  const intentionalStopRef = useRef(false);
  // Accumulated final text across multiple recognition sessions / restarts.
  const accumulatedRef = useRef("");
  // Finalized text within the current active recognition session.
  const currentSessionFinalRef = useRef("");
  // Timer that fires when we've been silently idle for too long.
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard against calling start() on an already-running instance.
  const isActiveRef = useRef(false);

  // ---------- helpers ----------

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // Too long without speech – finalize whatever we have.
      intentionalStopRef.current = true;
      if (recognitionRef.current && isActiveRef.current) {
        try { recognitionRef.current.stop(); } catch (_) { /* ignore */ }
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  // ---------- create SpeechRecognition instance ----------

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    setIsSupported(true);
    const recognition = new SpeechRecognition();

    // ---- critical settings ----
    recognition.continuous = true;       // Don't stop after first sentence
    recognition.interimResults = true;   // Show live text
    recognition.maxAlternatives = 3;     // Better accuracy
    recognition.lang = lang;

    // ---- event: results come in ----
    recognition.onresult = (event: any) => {
      let interim = "";
      let sessionFinal = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        // Pick the alternative with the highest confidence
        let bestAlt = result[0];
        for (let a = 1; a < result.length; a++) {
          if (result[a].confidence > bestAlt.confidence) {
            bestAlt = result[a];
          }
        }

        if (result.isFinal) {
          sessionFinal += bestAlt.transcript;
        } else {
          interim += bestAlt.transcript;
        }
      }

      currentSessionFinalRef.current = sessionFinal;

      // Calculate total final text (previous sessions + current session final)
      const prefix = accumulatedRef.current;
      const currentFinal = currentSessionFinalRef.current;
      const separator = prefix && currentFinal && !prefix.endsWith(" ") ? " " : "";
      const fullFinal = prefix + separator + currentFinal;

      // Display live feedback (finalized + interim text)
      const display = interim
        ? fullFinal + (fullFinal && !fullFinal.endsWith(" ") ? " " : "") + interim
        : fullFinal;

      setInterimTranscript(display);

      // Reset silence timer every time we get speech activity
      resetSilenceTimer();
    };

    // ---- event: recognition session ended ----
    recognition.onend = () => {
      isActiveRef.current = false;

      // Merge current session's final text into accumulatedRef before ending or restarting
      if (currentSessionFinalRef.current) {
        const prefix = accumulatedRef.current;
        const separator = prefix && !prefix.endsWith(" ") ? " " : "";
        accumulatedRef.current = (prefix + separator + currentSessionFinalRef.current).trim();
        currentSessionFinalRef.current = ""; // Clear for next session
      }

      if (intentionalStopRef.current) {
        // User pressed Stop (or silence timeout fired) – finalize.
        setIsListening(false);
        clearSilenceTimer();

        const finalText = accumulatedRef.current.trim();
        if (finalText) {
          setTranscript(finalText);
        }
        setInterimTranscript("");
      } else {
        // Browser killed the session on its own (e.g. brief silence, focus
        // change, internal error).  Restart transparently.
        try {
          recognition.start();
          isActiveRef.current = true;
        } catch (_) {
          // If restart fails, finalize with whatever we have.
          setIsListening(false);
          clearSilenceTimer();
          const finalText = accumulatedRef.current.trim();
          if (finalText) {
            setTranscript(finalText);
          }
          setInterimTranscript("");
        }
      }
    };

    // ---- event: error ----
    recognition.onerror = (event: any) => {
      // "no-speech" and "aborted" are benign – the onend handler will decide
      // whether to restart or finalize.
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }
      // "not-allowed" means the user denied microphone permission.
      console.error("Speech recognition error:", event.error);
      intentionalStopRef.current = true; // prevent restart loop
    };

    recognitionRef.current = recognition;

    return () => {
      intentionalStopRef.current = true;
      clearSilenceTimer();
      try { recognition.stop(); } catch (_) { /* ignore */ }
    };
  }, [lang, clearSilenceTimer, resetSilenceTimer]);

  // ---------- public API ----------

  const start = useCallback(() => {
    if (!recognitionRef.current || isActiveRef.current) return;

    // Reset all state for a fresh recording session
    accumulatedRef.current = "";
    currentSessionFinalRef.current = "";
    intentionalStopRef.current = false;
    setTranscript("");
    setInterimTranscript("");

    try {
      recognitionRef.current.start();
      isActiveRef.current = true;
      setIsListening(true);
      resetSilenceTimer();
    } catch (e) {
      console.error("Failed to start recognition:", e);
    }
  }, [resetSilenceTimer]);

  const stop = useCallback(() => {
    intentionalStopRef.current = true;
    clearSilenceTimer();

    // Merge any remaining text in currentSessionFinalRef
    if (currentSessionFinalRef.current) {
      const prefix = accumulatedRef.current;
      const separator = prefix && !prefix.endsWith(" ") ? " " : "";
      accumulatedRef.current = (prefix + separator + currentSessionFinalRef.current).trim();
      currentSessionFinalRef.current = "";
    }

    if (recognitionRef.current && isActiveRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) { /* ignore */ }
    } else {
      // Recognition already stopped – just finalize state
      setIsListening(false);
      const finalText = accumulatedRef.current.trim();
      if (finalText) {
        setTranscript(finalText);
      }
      setInterimTranscript("");
    }
  }, [clearSilenceTimer]);

  const reset = useCallback(() => {
    accumulatedRef.current = "";
    currentSessionFinalRef.current = "";
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

// ---------------------------------------------------------------------------
// Pronunciation scoring utilities (unchanged)
// ---------------------------------------------------------------------------

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
