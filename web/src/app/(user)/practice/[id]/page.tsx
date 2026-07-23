"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type CSSProperties,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, API_URL, getErrorMessage } from "@/lib/api";
import { queryKeys, useConversation, useMasteryMap } from "@/hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSpeechRecognition,
  scoreSpeechAccuracy,
  type SpeechAccuracyResult,
} from "@/hooks/useSpeechRecognition";
import { useAuthStore } from "@/stores/authStore";
import {
  ArrowLeft,
  Mic,
  Volume2,
  Play,
  SkipForward,
  Check,
  RotateCcw,
  Trophy,
  ArrowRightLeft,
  Timer,
  Zap,
  Sparkles,
} from "lucide-react";
import styles from "./practice.module.css";

interface Line {
  id: string;
  speaker: string;
  line_order: number;
  text_en: string;
  pronunciation_hint?: string;
  audio_url?: string;
}

interface ConvData {
  id: string;
  topic_id: string;
  title: string;
  description?: string;
  situation?: string;
  role_a_name: string;
  role_b_name: string;
  level: string;
  lines: Line[];
}

interface ScoreEntry {
  lineIndex: number;
  score: number;
  transcript: string;
  details: SpeechAccuracyResult;
  responseTime: number;
}

interface ChatEvaluation {
  score: number;
  grammar_feedback: string;
  vocabulary_tip: string;
  overall_feedback: string;
}

interface ChatMessage {
  role: "user" | "model";
  content: string;
  evaluation?: ChatEvaluation;
}

interface FreeTalkResponse {
  reply: string;
  evaluation: ChatEvaluation;
}

interface MasteryData {
  current_mode: number;
  mode_scores: Record<string, {
    best?: number;
    streak?: number;
    success_count?: number;
    role_success_counts?: Record<string, number>;
    passed?: boolean;
    passed_at?: string | null;
    last_success_at?: string | null;
  }>;
}

interface MasteryResult extends Partial<MasteryData> {
  mastery_level?: number;
  streak_perfect?: number;
}

interface ProgressSavePayload {
  attempt_id: string;
  conversation_id: string;
  role_played: "A" | "B";
  completed_lines: number;
  total_lines: number;
  is_completed: true;
  pronunciation_score: number;
  practice_mode: number;
  response_times: number[];
}

interface PendingSave {
  scores: ScoreEntry[];
  payload: ProgressSavePayload;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

type PracticeState =
  | "select_role"
  | "ready"
  | "partner_turn"
  | "your_turn"
  | "listening"
  | "scored"
  | "completed";

const MODES = [
  { id: 1, name: "Shadow Master", desc: "Listen, read, and repeat with full support.", icon: "1" },
  { id: 2, name: "Reader", desc: "Read the visible dialogue aloud at your own pace.", icon: "2" },
  { id: 3, name: "Listener", desc: "Listen to your partner and answer without seeing your line.", icon: "3" },
  { id: 4, name: "Speed Talker", desc: "Tap to Speak within 3 seconds, then say the line from memory.", icon: "4" },
  { id: 5, name: "Fluent", desc: "Hold a free conversation with AI using this topic.", icon: "5" },
];

const MODE_REQUIRED_SUCCESSES: Record<number, number> = {
  1: 3,
  2: 3,
  3: 3,
  4: 5,
  5: 2,
};

const RELEASED_MODE_COUNT = 4;
const SPEED_DRILL_TIMEOUT = 3.0;
const MAX_RESPONSE_TIME_SECONDS = 300;
const ROLE_SUCCESS_CAP_BY_MODE: Record<number, number> = {
  1: 2,
  2: 2,
  3: 2,
  4: 3,
  5: 1,
};

function PracticeSkeleton() {
  return (
    <div className={`${styles.container} animate-fade-in`} aria-label="Loading practice">
      <div className={`skeleton skeleton-text ${styles.backSkeleton}`} />
      <div className={styles.selectCard}>
        <div className={`skeleton skeleton-title ${styles.practiceTitleSkeleton}`} />
        <div className={`skeleton skeleton-text ${styles.practiceSituationSkeleton}`} />
        <div className={styles.selectionSection}>
          <div className={`skeleton skeleton-text ${styles.sectionLabelSkeleton}`} />
          <div className={styles.roleGrid}>
            <div className={styles.roleCard}>
              <div className={`skeleton ${styles.roleAvatarSkeleton}`} />
              <div className={`skeleton skeleton-text ${styles.roleNameSkeleton}`} />
            </div>
            <div className={styles.roleCard}>
              <div className={`skeleton ${styles.roleAvatarSkeleton}`} />
              <div className={`skeleton skeleton-text ${styles.roleNameSkeleton}`} />
            </div>
          </div>
        </div>
        <div className={styles.selectionSection}>
          <div className={`skeleton skeleton-text ${styles.sectionLabelSkeleton}`} />
          <div className={styles.modeList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={styles.modeItem}>
                <span className={`skeleton ${styles.modeIconSkeleton}`} />
                <div className={styles.modeInfo}>
                  <div className={`skeleton skeleton-title ${styles.modeNameSkeleton}`} />
                  <div className={`skeleton skeleton-text ${styles.modeDescSkeleton}`} />
                </div>
                <span className={`skeleton ${styles.modeProgressSkeleton}`} />
              </div>
            ))}
          </div>
        </div>
        <div className={`skeleton ${styles.startButtonSkeleton}`} />
      </div>
    </div>
  );
}

function getRoleProgress(mode: number, modeData?: { role_success_counts?: Record<string, number> }) {
  const roleCounts = modeData?.role_success_counts || {};
  const cap = ROLE_SUCCESS_CAP_BY_MODE[mode] || 1;
  const a = Math.min(roleCounts.A || 0, cap);
  const b = Math.min(roleCounts.B || 0, cap);
  return { a, b };
}

function recommendedRole(
  masteryData: MasteryData | null,
  mode: number
): "A" | "B" {
  if (!masteryData) return "A";

  const currentCounts =
    masteryData.mode_scores?.[mode.toString()]?.role_success_counts || {};
  const currentA = currentCounts.A || 0;
  const currentB = currentCounts.B || 0;
  if (currentA !== currentB) return currentA < currentB ? "A" : "B";

  let totalA = 0;
  let totalB = 0;
  Object.values(masteryData.mode_scores || {}).forEach((modeData) => {
    totalA += modeData.role_success_counts?.A || 0;
    totalB += modeData.role_success_counts?.B || 0;
  });
  return totalA <= totalB ? "A" : "B";
}

function createAttemptId(): string {
  return crypto.randomUUID();
}

function emptySpeechDetails(): SpeechAccuracyResult {
  return { score: 0, matchedWords: [], missedWords: [], wordDetails: [] };
}

function clampScore(value: unknown): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function elapsedSeconds(startedAt: number | null): number {
  if (startedAt === null) return 0;
  return Math.min(
    MAX_RESPONSE_TIME_SECONDS,
    Math.max(0, (Date.now() - startedAt) / 1000)
  );
}

export default function PracticePage() {
  const params = useParams();
  const qc = useQueryClient();
  const loadUser = useAuthStore((authState) => authState.loadUser);
  const userId = useAuthStore((authState) => authState.user?.id ?? "anonymous");
  const convId = params.id as string;
  const {
    data: rawConv,
    isLoading: convLoading,
    isError: convFailed,
    refetch: refetchConversation,
  } = useConversation(convId);
  const conv = rawConv as ConvData | null;
  const {
    data: rawMasteryMap = {},
    isLoading: masteryLoading,
    isError: masteryFailed,
    refetch: refetchMastery,
  } = useMasteryMap();
  const masteryMap = rawMasteryMap as Record<string, MasteryData>;
  const loading = convLoading || masteryLoading;

  const [localMasteryData, setLocalMasteryData] = useState<MasteryData | null>(null);
  const masteryData = localMasteryData || masteryMap[convId] || null;

  const [selectedRole, setSelectedRole] = useState<"A" | "B" | null>(null);
  const [selectedMode, setSelectedMode] = useState<number | null>(null);
  const practiceMode =
    selectedMode ??
    Math.min(masteryData?.current_mode || 1, RELEASED_MODE_COUNT);
  const myRole = selectedRole ?? recommendedRole(masteryData, practiceMode);
  
  const [state, setState] = useState<PracticeState>("select_role");
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masteryResult, setMasteryResult] = useState<MasteryResult | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const [interactionError, setInteractionError] = useState("");

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const [turnStartTime, setTurnStartTime] = useState<number | null>(null);
  const [currentResponseTime, setCurrentResponseTime] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState(SPEED_DRILL_TIMEOUT);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatAreaRef = useRef<HTMLDivElement | null>(null);
  const speedTapTimeRef = useRef<number | null>(null);
  const attemptIdRef = useRef<string | null>(null);
  const pendingSaveRef = useRef<PendingSave | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    isListening: sttActive,
    transcript,
    interimTranscript,
    start: startListening,
    stop: stopListening,
    reset: resetSpeech,
    isSupported: speechIsSupported,
    error: speechError,
  } = useSpeechRecognition("en-US");

  const currentLine = conv?.lines[currentLineIndex] || null;
  const isMyTurn = currentLine?.speaker === myRole;
  const totalLines = conv?.lines.length || 0;
  const myLinesCount = conv?.lines.filter((l) => l.speaker === myRole).length || 0;
  
  const progress =
    practiceMode === 5
      ? Math.min((chatHistory.length / 10) * 100, 100)
      : totalLines > 0
        ? (currentLineIndex / totalLines) * 100
        : 0;

  const cancelPlayback = useCallback(() => {
    if (audioWatchdogRef.current) {
      clearTimeout(audioWatchdogRef.current);
      audioWatchdogRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onstalled = null;
      audioRef.current.onabort = null;
      audioRef.current.onplaying = null;
      audioRef.current = null;
    }
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
    }
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  const beginUserTurn = useCallback(() => {
    const startedAt = Date.now();
    setState("your_turn");
    setTurnStartTime(startedAt);
    setElapsedTime(0);
    setTimeLeft(SPEED_DRILL_TIMEOUT);
    setInteractionError("");
  }, []);

  const saveProgress = useCallback(
    async (sessionScores?: ScoreEntry[]) => {
      const effectiveScores =
        pendingSaveRef.current?.scores ?? sessionScores ?? scores;
      if (!conv || effectiveScores.length === 0) {
        setSaveStatus("error");
        setSaveError("No completed speaking turns are available to save.");
        return;
      }

      if (!pendingSaveRef.current) {
        const attemptId = attemptIdRef.current || createAttemptId();
        attemptIdRef.current = attemptId;
        const averageScore = Math.round(
          effectiveScores.reduce((sum, entry) => sum + entry.score, 0) /
            effectiveScores.length
        );
        pendingSaveRef.current = {
          scores: [...effectiveScores],
          payload: {
            attempt_id: attemptId,
            conversation_id: conv.id,
            role_played: myRole,
            completed_lines:
              practiceMode === 5 ? effectiveScores.length : myLinesCount,
            total_lines:
              practiceMode === 5 ? effectiveScores.length : myLinesCount,
            is_completed: true,
            pronunciation_score: averageScore,
            practice_mode: practiceMode,
            response_times: effectiveScores.map((entry) => entry.responseTime),
          },
        };
      }

      setSaveStatus("saving");
      setSaveError("");
      try {
        const saveResponse = await api.post<MasteryResult>(
          "/api/progress",
          pendingSaveRef.current.payload
        );

        setMasteryResult(saveResponse.data);
        setSaveStatus("saved");
        pendingSaveRef.current = null;
        void qc.invalidateQueries({ queryKey: queryKeys.progress(userId) });
        void loadUser();

        try {
          const masteryResponse = await api.get<Record<string, MasteryData>>(
            "/api/progress/mastery"
          );
          if (masteryResponse.data[conv.id]) {
            setLocalMasteryData(masteryResponse.data[conv.id]);
          }
        } catch {
          // The attempt is already saved; cached mastery will refresh separately.
        }
      } catch (saveFailure) {
        setSaveStatus("error");
        setSaveError(getErrorMessage(saveFailure));
      }
    },
    [conv, loadUser, myLinesCount, myRole, practiceMode, qc, scores, userId]
  );

  const finishPractice = useCallback(
    (sessionScores: ScoreEntry[] = scores) => {
      cancelPlayback();
      stopListening();
      setState("completed");
      void saveProgress(sessionScores);
    },
    [cancelPlayback, saveProgress, scores, stopListening]
  );

  const advanceAfterPartner = useCallback(() => {
    const nextIndex = currentLineIndex + 1;
    if (conv && nextIndex < totalLines) {
      setCurrentLineIndex(nextIndex);
      if (conv.lines[nextIndex].speaker === myRole) {
        beginUserTurn();
      } else {
        setState("partner_turn");
      }
      return;
    }
    finishPractice();
  }, [
    beginUserTurn,
    conv,
    currentLineIndex,
    finishPractice,
    myRole,
    totalLines,
  ]);

  const speakWithTTS = useCallback(
    (text: string, isPartner = false) => {
      cancelPlayback();
      setIsPlaying(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      utteranceRef.current = utterance;
      let settled = false;

      const finishPlayback = () => {
        if (settled) return;
        settled = true;
        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current);
          speechTimeoutRef.current = null;
        }
        utteranceRef.current = null;
        setIsPlaying(false);
        if (isPartner) {
          if (practiceMode === 5) beginUserTurn();
          else advanceAfterPartner();
        }
      };

      utterance.onend = finishPlayback;
      utterance.onerror = finishPlayback;
      speechTimeoutRef.current = setTimeout(() => {
        // A watchdog must stop the underlying voice before advancing the
        // state machine, otherwise it can continue into the user's mic turn.
        window.speechSynthesis.cancel();
        finishPlayback();
      }, Math.min(120_000, Math.max(10_000, text.split(/\s+/).length * 900 + 5_000)));

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finishPlayback();
      }
    },
    [advanceAfterPartner, beginUserTurn, cancelPlayback, practiceMode]
  );

  const playAudio = useCallback(
    (line: Line, isPartner = true) => {
      cancelPlayback();
      const audioUrl = line.audio_url
        ? /^(https?:|blob:|data:)/.test(line.audio_url)
          ? line.audio_url
          : `${API_URL}${line.audio_url.startsWith("/") ? "" : "/"}${line.audio_url}`
        : null;

      if (!audioUrl) {
        speakWithTTS(line.text_en, isPartner);
        return;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setIsPlaying(true);
      let didFallback = false;
      const clearAudioWatchdog = () => {
        if (audioWatchdogRef.current) {
          clearTimeout(audioWatchdogRef.current);
          audioWatchdogRef.current = null;
        }
      };
      const armAudioWatchdog = (timeoutMs: number) => {
        clearAudioWatchdog();
        audioWatchdogRef.current = setTimeout(
          fallbackToSpeech,
          timeoutMs
        );
      };
      const fallbackToSpeech = () => {
        if (didFallback) return;
        didFallback = true;
        clearAudioWatchdog();
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        audio.onstalled = null;
        audio.onabort = null;
        audio.onplaying = null;
        audioRef.current = null;
        setIsPlaying(false);
        speakWithTTS(line.text_en, isPartner);
      };

      audio.onended = () => {
        clearAudioWatchdog();
        audioRef.current = null;
        setIsPlaying(false);
        if (isPartner) advanceAfterPartner();
      };
      audio.onerror = fallbackToSpeech;
      audio.onstalled = fallbackToSpeech;
      audio.onabort = fallbackToSpeech;
      audio.onplaying = () => {
        const expectedDuration = Number.isFinite(audio.duration)
          ? audio.duration * 1000 + 5_000
          : 30_000;
        armAudioWatchdog(Math.min(60_000, Math.max(10_000, expectedDuration)));
      };
      armAudioWatchdog(15_000);
      void audio.play().catch(fallbackToSpeech);
    },
    [advanceAfterPartner, cancelPlayback, speakWithTTS]
  );

  const handleFreeTalkInput = useCallback(
    async (input: string) => {
      setState("partner_turn");
      setIsAiThinking(true);
      setInteractionError("");
      const responseTime = elapsedSeconds(turnStartTime);
      setCurrentResponseTime(responseTime);

      try {
        const response = await api.post<FreeTalkResponse>(
          "/api/chat/free-talk",
          {
            conversation_id: convId,
            user_input: input,
            history: chatHistory.map(({ role, content }) => ({ role, content })),
            role_played: myRole,
          }
        );
        const evaluation = {
          ...response.data.evaluation,
          score: clampScore(response.data.evaluation.score),
        };
        const userEntry: ChatMessage = {
          role: "user",
          content: input,
          evaluation,
        };
        const partnerEntry: ChatMessage = {
          role: "model",
          content: response.data.reply,
        };

        setChatHistory((previous) => [
          ...previous,
          userEntry,
          partnerEntry,
        ]);
        setScores((previous) => [
          ...previous,
          {
            lineIndex: chatHistory.length,
            score: evaluation.score,
            transcript: input,
            details: emptySpeechDetails(),
            responseTime,
          },
        ]);
        setState("scored");
        speakWithTTS(response.data.reply);
      } catch (chatFailure) {
        setInteractionError(getErrorMessage(chatFailure));
        beginUserTurn();
      } finally {
        setIsAiThinking(false);
      }
    },
    [
      beginUserTurn,
      chatHistory,
      convId,
      myRole,
      speakWithTTS,
      turnStartTime,
    ]
  );

  const processSpeechResult = useCallback(
    (text: string) => {
      if (!text || state !== "listening") return;

      if (practiceMode === 5) {
        void handleFreeTalkInput(text);
        return;
      }
      if (!currentLine) return;

      const responseTime =
        practiceMode === 4
          ? speedTapTimeRef.current ?? elapsedSeconds(turnStartTime)
          : elapsedSeconds(turnStartTime);
      const result = scoreSpeechAccuracy(currentLine.text_en, text);
      setScores((previous) => [
        ...previous,
        {
          lineIndex: currentLineIndex,
          score: result.score,
          transcript: text,
          details: result,
          responseTime,
        },
      ]);
      setCurrentResponseTime(responseTime);
      speedTapTimeRef.current = null;
      setState("scored");
    },
    [
      currentLine,
      currentLineIndex,
      handleFreeTalkInput,
      practiceMode,
      state,
      turnStartTime,
    ]
  );

  const handleTimeout = useCallback(() => {
    if (state !== "your_turn") return;
    setScores((previous) => [
      ...previous,
      {
        lineIndex: currentLineIndex,
        score: 0,
        transcript: "[Time Out]",
        details: emptySpeechDetails(),
        responseTime: SPEED_DRILL_TIMEOUT,
      },
    ]);
    setCurrentResponseTime(SPEED_DRILL_TIMEOUT);
    setState("scored");
  }, [currentLineIndex, state]);

  const isReplayDisabled = state === "partner_turn" || isAiThinking;

  const replayText = useCallback(
    (text: string) => {
      if (!isReplayDisabled) speakWithTTS(text, false);
    },
    [isReplayDisabled, speakWithTTS]
  );

  const replayLine = useCallback(
    (line: Line) => {
      if (!isReplayDisabled) playAudio(line, false);
    },
    [isReplayDisabled, playAudio]
  );

  useEffect(() => {
    if (
      state === "partner_turn" &&
      currentLine &&
      !isMyTurn &&
      practiceMode !== 5
    ) {
      const timer = setTimeout(() => playAudio(currentLine, true), 600);
      return () => clearTimeout(timer);
    }
  }, [currentLine, isMyTurn, playAudio, practiceMode, state]);

  useEffect(() => {
    if (transcript && state === "listening") {
      // SpeechRecognition is an external event source; process its final value once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      processSpeechResult(transcript);
    }
  }, [processSpeechResult, state, transcript]);

  useEffect(() => {
    if (!sttActive && state === "listening" && !transcript) {
      // The recognition engine ended without text, so make retry possible.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      beginUserTurn();
    }
  }, [beginUserTurn, state, sttActive, transcript]);

  useEffect(() => {
    if (
      state !== "your_turn" ||
      practiceMode !== 4 ||
      turnStartTime === null
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      const remaining = Math.min(
        SPEED_DRILL_TIMEOUT,
        Math.max(0, SPEED_DRILL_TIMEOUT - elapsedSeconds(turnStartTime))
      );
      setTimeLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        handleTimeout();
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [handleTimeout, practiceMode, state, turnStartTime]);

  useEffect(() => {
    if (
      state !== "your_turn" ||
      practiceMode === 4 ||
      turnStartTime === null
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedTime(elapsedSeconds(turnStartTime));
    }, 100);
    return () => window.clearInterval(timer);
  }, [practiceMode, state, turnStartTime]);

  const handleStart = async () => {
    if (saveStatus === "saving" || saveStatus === "error") return;
    cancelPlayback();
    stopListening();
    resetSpeech();
    setCurrentLineIndex(0);
    setScores([]);
    setChatHistory([]);
    setMasteryResult(null);
    setSaveStatus("idle");
    setSaveError("");
    setInteractionError("");
    attemptIdRef.current = createAttemptId();
    pendingSaveRef.current = null;
    speedTapTimeRef.current = null;

    if (practiceMode === 5) {
      if (myRole === "A") {
        beginUserTurn();
        return;
      }

      setState("partner_turn");
      setIsAiThinking(true);
      try {
        const response = await api.post<FreeTalkResponse>(
          "/api/chat/free-talk",
          {
            conversation_id: convId,
            user_input: "Hello! Let's start the conversation.",
            history: [],
            role_played: "B",
          }
        );
        setChatHistory([
          { role: "model", content: response.data.reply },
        ]);
        speakWithTTS(response.data.reply, true);
      } catch (startFailure) {
        setInteractionError(getErrorMessage(startFailure));
        setState("select_role");
      } finally {
        setIsAiThinking(false);
      }
      return;
    }

    if (!conv || conv.lines.length === 0) {
      setInteractionError("This conversation has no dialogue lines to practice.");
      setState("select_role");
      return;
    }

    if (conv.lines[0].speaker === myRole) {
      beginUserTurn();
    } else {
      setState("partner_turn");
    }
  };

  const moveToNext = () => {
    if (practiceMode === 5) {
      beginUserTurn();
      return;
    }

    const nextIndex = currentLineIndex + 1;
    if (conv && nextIndex < totalLines) {
      setCurrentLineIndex(nextIndex);
      if (conv.lines[nextIndex].speaker === myRole) {
        beginUserTurn();
      } else {
        setState("partner_turn");
      }
      return;
    }
    finishPractice();
  };

  const handleSpeak = () => {
    if (!speechIsSupported) {
      setInteractionError(
        "Speech recognition is not supported here. Use a recent Chrome or Edge browser."
      );
      return;
    }
    speedTapTimeRef.current =
      practiceMode === 4 && turnStartTime
        ? elapsedSeconds(turnStartTime)
        : null;
    setInteractionError("");
    resetSpeech();
    setState("listening");
    startListening();
  };

  const handleRetry = () => {
    if (practiceMode === 5) {
      setChatHistory((previous) => previous.slice(0, -2));
      setScores((previous) => previous.slice(0, -1));
    } else {
      setScores((previous) =>
        previous.filter((entry) => entry.lineIndex !== currentLineIndex)
      );
    }
    resetSpeech();
    beginUserTurn();
  };

  const handleSkip = () => {
    if (state !== "your_turn") return;
    const responseTime = elapsedSeconds(turnStartTime);
    const skippedEntry: ScoreEntry = {
      lineIndex: currentLineIndex,
      score: 0,
      transcript: "[Skipped]",
      details: emptySpeechDetails(),
      responseTime,
    };
    const nextScores = [...scores, skippedEntry];
    setScores(nextScores);
    resetSpeech();
    stopListening();

    const nextIndex = currentLineIndex + 1;
    if (conv && nextIndex < totalLines) {
      setCurrentLineIndex(nextIndex);
      if (conv.lines[nextIndex].speaker === myRole) {
        beginUserTurn();
      } else {
        setState("partner_turn");
      }
      return;
    }
    finishPractice(nextScores);
  };

  const handleStop = () => stopListening();

  const returnToSelection = () => {
    cancelPlayback();
    stopListening();
    resetSpeech();
    setInteractionError("");
    setState("select_role");
  };

  const discardUnsavedAttempt = () => {
    pendingSaveRef.current = null;
    setSaveStatus("idle");
    setSaveError("");
  };

  const hasUnsavedAttempt =
    state === "completed" &&
    (saveStatus === "saving" || saveStatus === "error");

  useEffect(() => {
    if (!hasUnsavedAttempt) return;

    const warning =
      "This practice attempt has not been saved. Leave and discard it?";
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("a[href]")) return;
      if (!window.confirm(warning)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [hasUnsavedAttempt]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    chatAreaRef.current?.scrollTo({
      top: chatAreaRef.current.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [chatHistory.length, currentLineIndex, scores.length, state]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.onstalled = null;
        audioRef.current.onabort = null;
        audioRef.current.onplaying = null;
      }
      if (utteranceRef.current) {
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
      }
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
      if (audioWatchdogRef.current) clearTimeout(audioWatchdogRef.current);
      window.speechSynthesis.cancel();
    };
  }, []);

  if (loading) return <PracticeSkeleton />;
  if (convFailed) {
    return (
      <div className={`${styles.container} animate-fade-in`}>
        <div className="empty-state" role="alert">
          <h3>Could not load this conversation</h3>
          <p>Check your connection and try again.</p>
          <button
            className="btn btn-primary"
            onClick={() => void refetchConversation()}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!conv) {
    return (
      <div className="empty-state">
        <h3>Conversation not found</h3>
        <Link href="/topics" className="btn btn-primary">
          Back to topics
        </Link>
      </div>
    );
  }

  if (state === "completed") {
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length) : null;
    const avgRT = scores.length > 0 ? scores.reduce((a, s) => a + s.responseTime, 0) / scores.length : 0;
    const mastery = masteryResult?.mastery_level || 0;
    const streak = masteryResult?.streak_perfect || 0;

    return (
      <div className={`${styles.container} animate-fade-in`}>
        <div className={styles.completedCard}>
          <div className={styles.trophy}><Trophy size={48} /></div>
          <h1>Practice Complete! 🎉</h1>
          <p>{conv.title}</p>
          <div className={styles.finalStatsRow}>
            {avgScore !== null && (
               <div className={styles.finalStatItem}>
                 <div className={styles.finalStatCircle}><span className={styles.finalStatNum}>{avgScore}</span><span className={styles.finalStatLabel}>%</span></div>
                 <div className={styles.finalStatText}>Speech accuracy</div>
               </div>
            )}
            <div className={styles.finalStatItem}>
                 <div className={`${styles.finalStatCircle} ${avgRT < 2.5 ? styles.statGreen : styles.statOrange}`}><span className={styles.finalStatNum}>{avgRT.toFixed(1)}</span><span className={styles.finalStatLabel}>s</span></div>
                 <div className={styles.finalStatText}>Reflex Speed</div>
            </div>
          </div>
           {masteryResult && (
             <div className={styles.masteryCard}>
              <div className={styles.masteryTitle}>{mastery >= 95 ? "🏆 Conversation Mastered!" : "📊 Mastery Progress"}</div>
              <div className={styles.masteryBarLg} role="progressbar" aria-label="Conversation mastery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={mastery}><div className={styles.masteryFillLg} style={{ width: `${mastery}%`, background: mastery >= 95 ? "linear-gradient(90deg, #10b981, #059669)" : "linear-gradient(90deg, var(--primary), var(--primary-600))" }} /></div>
              <div className={styles.masteryStats}><span className={styles.masteryLevel}>{mastery.toFixed(1)}%</span><span className={styles.masteryDetail}>🔥 Streak: {streak}/5</span><span className={styles.masteryDetail}>📖 Level: {practiceMode}/{RELEASED_MODE_COUNT}</span></div>
             </div>
           )}
           {saveStatus === "saving" && (
             <div className="alert" role="status" aria-live="polite">
               <div className="spinner" /> Saving your progress...
             </div>
           )}
           {saveStatus === "saved" && (
             <div className="alert alert-success" role="status">
               Progress saved successfully.
             </div>
           )}
           {saveStatus === "error" && (
             <div className="alert alert-error" role="alert">
               <span>{saveError}</span>
               <button
                 className="btn btn-secondary btn-sm"
                 onClick={() => void saveProgress()}
               >
                 Retry save
               </button>
               <button
                 className="btn btn-ghost btn-sm"
                 onClick={discardUnsavedAttempt}
               >
                 Discard attempt
               </button>
             </div>
           )}
           {!hasUnsavedAttempt && (
             <div className={styles.completedActions}>
               <button className="btn btn-primary btn-lg" onClick={returnToSelection}><ArrowRightLeft size={18} /> Swap Role & Retry</button>
               <button className="btn btn-secondary btn-lg" onClick={() => void handleStart()}><RotateCcw size={18} /> Practice Again</button>
              <Link href="/topics" className="btn btn-ghost btn-lg">Back to Topics</Link>
            </div>
           )}
        </div>
      </div>
    );
  }

  if (state === "select_role") {
    return (
      <div className={`${styles.container} animate-fade-in`}>
        <Link href={`/topics/${conv.topic_id}`} className={styles.backLink}><ArrowLeft size={18} /> Back to Topic</Link>
         <div className={styles.selectCard}>
           <h1>{conv.title}</h1>
           {masteryFailed && (
             <div className="alert alert-error" role="alert">
               <span>Your level progress could not be loaded.</span>
               <button
                 className="btn btn-secondary btn-sm"
                 onClick={() => void refetchMastery()}
               >
                 Retry
               </button>
             </div>
           )}
           {interactionError && (
             <div className="alert alert-error" role="alert">
               {interactionError}
             </div>
           )}
           {conv.lines.length === 0 && (
             <div className="alert alert-error" role="alert">
               This conversation has no dialogue lines. Ask an administrator to
               add lines before practicing.
             </div>
           )}
          {conv.situation && <p className={styles.situation}>📍 {conv.situation}</p>}
          <div className={styles.selectionSection}>
            <h2 className={styles.selectTitle}>Choose Your Role</h2>
            <div className={styles.roleGrid}>
              <button className={`${styles.roleCard} ${myRole === "A" ? styles.roleActive : ""}`} onClick={() => setSelectedRole("A")} aria-pressed={myRole === "A"}><div className={styles.roleAvatar}>A</div><div className={styles.roleName}>{conv.role_a_name}</div></button>
              <button className={`${styles.roleCard} ${myRole === "B" ? styles.roleActive : ""}`} onClick={() => setSelectedRole("B")} aria-pressed={myRole === "B"}><div className={styles.roleAvatar}>B</div><div className={styles.roleName}>{conv.role_b_name}</div></button>
            </div>
          </div>
          <div className={styles.selectionSection}>
            <h2 className={styles.selectTitle}>Practice Level</h2>
            <div className={styles.modeList}>
              {MODES.map((m) => {
                const isComingSoon = m.id === 5;
                const isUnlocked = !isComingSoon && m.id <= (masteryData?.current_mode || 1);
                const isLocked = !isUnlocked;
                
                let progressValue = 0;
                let progressLabel = "";
                const currentModeData = masteryData?.mode_scores?.[m.id.toString()];
                const required = MODE_REQUIRED_SUCCESSES[m.id] || 1;
                const successCount = Math.min(currentModeData?.success_count || 0, required);
                if (isComingSoon) {
                  progressLabel = "Soon";
                } else if (MODE_REQUIRED_SUCCESSES[m.id]) {
                  progressValue = Math.min(Math.round((successCount / required) * 100), 100);
                  progressLabel = `${successCount}/${required}`;
                }
                const prevMode = MODES.find(mod => mod.id === m.id - 1);
                const unlockRequirement = m.id === 5
                  ? "Coming soon: AI free conversation is in development"
                  : m.id === 4
                    ? "Unlock: Score 90%+ x3 in Listener"
                    : `Unlock: Score 90%+ x${MODE_REQUIRED_SUCCESSES[m.id - 1] || 1} in ${prevMode?.name || "previous level"}`;
                const roleProgress = !isComingSoon && MODE_REQUIRED_SUCCESSES[m.id]
                  ? getRoleProgress(m.id, currentModeData)
                  : null;

                return (
                  <button 
                    key={m.id} 
                    className={`${styles.modeItem} ${practiceMode === m.id ? styles.modeActive : ""} ${isLocked ? styles.modeLocked : ""}`} 
                    onClick={() => {
                      if (!isLocked) {
                        setSelectedMode(m.id);
                        setSelectedRole(null);
                      }
                    }}
                    disabled={isLocked}
                    style={{
                      '--unlock-progress': `${progressValue}%`
                    } as CSSProperties & { "--unlock-progress": string }}
                  >
                    <span className={styles.modeIcon}>{m.icon}</span>
                    <div className={styles.modeInfo}>
                      <div className={styles.modeName}>{m.name}</div>
                      <div className={styles.modeDesc}>
                        {isLocked ? unlockRequirement : m.desc}
                      </div>
                      {roleProgress && (
                        <div className={styles.modeRoleProgress} aria-label="Role unlock progress">
                          <span className={roleProgress.a > 0 ? styles.modeRoleActive : styles.modeRoleInactive}>
                            Role A
                          </span>
                          <span className={roleProgress.b > 0 ? styles.modeRoleActive : styles.modeRoleInactive}>
                            Role B
                          </span>
                          <small>Need both roles</small>
                        </div>
                      )}
                    </div>
                    {progressLabel && <span className={styles.modeProgressLabel}>{progressLabel}</span>}
                    {isLocked && <div className={styles.lockBadge}>🔒</div>}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="btn btn-primary btn-lg" style={{ width: "100%" }} onClick={() => void handleStart()} disabled={conv.lines.length === 0}><Play size={18} /> Start Practice</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <div className={styles.topBar}>
        <button className="btn btn-ghost btn-sm" onClick={returnToSelection}><ArrowLeft size={16} /> Exit</button>
        <div className={styles.modeBadgeTop}>{MODES.find(m => m.id === practiceMode)?.name}</div>
        {practiceMode === 5 ? (
           <button className="btn btn-success btn-sm" onClick={() => finishPractice()} disabled={scores.length === 0}>Finish Practice</button>
        ) : (
          <div className={styles.progressInfo}>{currentLineIndex + 1} / {totalLines}</div>
        )}
      </div>

      <div className={styles.progressBar} role="progressbar" aria-label="Practice progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>

      <div className={styles.chatArea} ref={chatAreaRef}>
        {practiceMode === 5 ? (
          chatHistory.map((h, i) => (
            <div key={i} className={`${styles.bubble} ${h.role === "user" ? styles.bubbleMine : styles.bubblePartner}`}>
               <div className={styles.bubbleRole}>{h.role === "user" ? "You" : "AI"}</div>
               <div className={styles.bubbleContent}>
                 <p className={styles.bubbleText}>{h.content}</p>
                 <button className={`${styles.replayBtn} ${isReplayDisabled ? styles.replayBtnDisabled : ""}`} onClick={() => replayText(h.content)} disabled={isReplayDisabled} aria-label="Replay message"><Volume2 size={14} /></button>
               </div>
            </div>
          ))
        ) : (
          conv.lines.slice(0, currentLineIndex + 1).map((line, i) => {
            const isMine = line.speaker === myRole;
            const lineScore = scores.find((s) => s.lineIndex === i);
            const isPast = i < currentLineIndex;
            const isCurrent = i === currentLineIndex;
            let showText = true;
            if (practiceMode === 3 && isMine && isCurrent && state !== "scored") showText = false;
            if (practiceMode === 4 && isMine && isCurrent && state === "listening") showText = false;
            const showReplay = practiceMode !== 2 && practiceMode !== 4;
            return (
              <div key={line.id} className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubblePartner} ${isCurrent ? styles.bubbleCurrent : ""} ${isPast ? styles.bubblePast : ""}`}>
                <div className={styles.bubbleRole}>{line.speaker === "A" ? conv.role_a_name : conv.role_b_name}</div>
                <div className={styles.bubbleContent}>
                  {showText ? <p className={styles.bubbleText}>{line.text_en}</p> : <div className={styles.hiddenTextPlaceholder}><Zap size={14} /> Listen & respond...</div>}
                  {showReplay && (
                    <button className={`${styles.replayBtn} ${isReplayDisabled ? styles.replayBtnDisabled : ""}`} onClick={() => replayLine(line)} disabled={isReplayDisabled} aria-label="Replay line"><Volume2 size={14} /></button>
                  )}
                </div>
                {lineScore && <div className={styles.bubbleMeta}><span className={styles.lineScore}>🎤 {lineScore.score}%</span><span className={styles.lineTime}>⚡ {lineScore.responseTime.toFixed(1)}s</span></div>}
              </div>
            );
          })
        )}
      </div>

      <div className={styles.actionArea}>
        {(interactionError || speechError) && (
          <div className="alert alert-error" role="alert">
            {interactionError || speechError}
          </div>
        )}
        {(state === "partner_turn" || isAiThinking) && (
          <div className={styles.actionMessage}>
            <Volume2 size={20} className={isPlaying ? styles.pulseAnim : ""} />
            <span>{isAiThinking ? "AI is thinking..." : "Partner is speaking..."}</span>
          </div>
        )}

        {state === "your_turn" && (
          <div className={styles.yourTurnArea}>
             <div className={styles.reflexTimer}>
                {practiceMode === 4 ? (
                  <span className={styles.timeUrgent}><Zap size={14} /> {timeLeft.toFixed(1)}s remaining</span>
                ) : (
                  <><Timer size={14} /> {elapsedTime.toFixed(1)}s</>
                )}
             </div>
             <div className={styles.actionButtons}>
                <button className={`btn btn-primary btn-lg ${styles.speakBtn}`} onClick={handleSpeak}><Mic size={22} /> Tap to Speak</button>
                {practiceMode !== 5 && <button className="btn btn-ghost btn-sm" onClick={handleSkip}><SkipForward size={16} /> Skip</button>}
             </div>
          </div>
        )}

        {state === "listening" && (
          <div className={styles.listeningArea}>
            <button type="button" className={styles.micActive} onClick={handleStop} title="Stop recording" aria-label="Stop recording and score this answer">
              <div className={styles.micRing} />
              <div className={styles.micRing2} />
              <Mic size={28} />
            </button>
            <div className={styles.transcriptLive} role="status" aria-live="polite">{interimTranscript || "Listening..."}</div>
            <button className="btn btn-secondary btn-sm" onClick={handleStop} style={{ marginTop: 12 }}>
              Stop & Process
            </button>
          </div>
        )}

        {state === "scored" && (
          <div className={styles.scoredArea}>
            {(() => {
              const lastScore = scores[scores.length - 1];
              const lastEval = practiceMode === 5 ? chatHistory[chatHistory.length - 2]?.evaluation : null;
              if (!lastScore && !lastEval) return null;
              
              return (
                <>
                  <div className={styles.scoredResult}>
                    <div className={styles.scoredHeader}>
                       <div className={styles.scoreCircleSmall}>{lastEval ? lastEval.score : lastScore.score}%</div>
                       <div className={styles.rtBadge}><Zap size={12} /> {currentResponseTime.toFixed(1)}s</div>
                       {practiceMode === 5 && <div className={styles.aiBadge}><Sparkles size={12} /> AI Evaluated</div>}
                    </div>
                    <div className={styles.scoredDetails}>
                      <div className={styles.scoredTranscript}>&ldquo;{lastScore?.transcript || chatHistory[chatHistory.length-2]?.content}&rdquo;</div>
                      {practiceMode === 5 && lastEval ? (
                        <div className={styles.aiEvaluationContent}>
                           <div className={styles.evalItem}><strong>Grammar:</strong> {lastEval.grammar_feedback}</div>
                           <div className={styles.evalItem}><strong>Vocab:</strong> {lastEval.vocabulary_tip}</div>
                           <div className={styles.evalItem}><strong>Overall:</strong> {lastEval.overall_feedback}</div>
                        </div>
                      ) : (
                        lastScore && lastScore.details && (
                          <div className={styles.wordResults}>
                            {lastScore.details.wordDetails.map((wordDetail, index) => (
                              <span key={`${wordDetail.word}-${index}`} className={wordDetail.matched ? styles.wordMatch : styles.wordMiss}>{wordDetail.word}</span>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                  <div className={styles.scoredActions}>
                    <button className="btn btn-primary" onClick={moveToNext}><Check size={16} /> Continue</button>
                    {practiceMode === 4 ? (
                      <button className="btn btn-secondary" onClick={handleStart}><RotateCcw size={16} /> Restart Conversation</button>
                    ) : (
                      <button className="btn btn-secondary" onClick={handleRetry}><RotateCcw size={16} /> Retry</button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
