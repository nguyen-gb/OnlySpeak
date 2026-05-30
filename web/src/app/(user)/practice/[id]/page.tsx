"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, API_URL } from "@/lib/api";
import { useConversation, useMasteryMap } from "@/hooks/useApi";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSpeechRecognition,
  scorePronunciation,
} from "@/hooks/useSpeechRecognition";
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
  details: any;
  responseTime: number;
}

interface ChatMessage {
  role: string;
  content: string;
  evaluation?: {
    score: number;
    grammar_feedback: string;
    vocabulary_tip: string;
    overall_feedback: string;
  };
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

export default function PracticePage() {
  const params = useParams();
  const router = useRouter();

  const qc = useQueryClient();
  const convId = params.id as string;
  const { data: rawConv, isLoading: convLoading } = useConversation(convId);
  const conv = rawConv as ConvData | null;
  const { data: masteryMap = {}, isLoading: masteryLoading } = useMasteryMap();
  const loading = convLoading || masteryLoading;

  const [localMasteryData, setLocalMasteryData] = useState<any>(null);
  const masteryData = localMasteryData || masteryMap[convId] || null;

  const [myRole, setMyRole] = useState<"A" | "B">("B");
  const [practiceMode, setPracticeMode] = useState(1);
  
  const [state, setState] = useState<PracticeState>("select_role");
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masteryResult, setMasteryResult] = useState<any>(null);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const [turnStartTime, setTurnStartTime] = useState<number | null>(null);
  const [currentResponseTime, setCurrentResponseTime] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState(SPEED_DRILL_TIMEOUT);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatAreaRef = useRef<HTMLDivElement | null>(null);
  const speedTapTimeRef = useRef<number | null>(null);
  const {
    isListening: sttActive,
    transcript,
    interimTranscript,
    start: startListening,
    stop: stopListening,
    reset: resetSpeech,
  } = useSpeechRecognition("en-US");

  useEffect(() => {
    if (masteryMap[convId]) {
      setLocalMasteryData(null);
    }
  }, [masteryMap, convId]);

  useEffect(() => {
    if (masteryData?.current_mode) {
      setPracticeMode(Math.min(masteryData.current_mode, RELEASED_MODE_COUNT));
    }
  }, [masteryData]);

  // Auto-select role with fewer successes in the currently selected practice mode
  useEffect(() => {
    if (!masteryData) return;
    const modeData = masteryData.mode_scores?.[practiceMode.toString()];
    const counts = modeData?.role_success_counts || {};
    const countA = counts.A || 0;
    const countB = counts.B || 0;
    
    if (countA < countB) {
      setMyRole("A");
    } else if (countB < countA) {
      setMyRole("B");
    } else {
      // If equal in current mode, check total across all modes
      let totalA = 0;
      let totalB = 0;
      Object.values(masteryData.mode_scores || {}).forEach((m: any) => {
        const c = m?.role_success_counts || {};
        totalA += c.A || 0;
        totalB += c.B || 0;
      });
      if (totalA < totalB) {
        setMyRole("A");
      } else if (totalB < totalA) {
        setMyRole("B");
      } else {
        setMyRole("A"); // Default to A if completely equal
      }
    }
  }, [practiceMode, masteryData]);

  const currentLine = conv?.lines[currentLineIndex] || null;
  const isMyTurn = currentLine?.speaker === myRole;
  const totalLines = conv?.lines.length || 0;
  const myLinesCount = conv?.lines.filter((l) => l.speaker === myRole).length || 0;
  
  const progress = practiceMode === 5 
    ? Math.min((chatHistory.length / 10) * 100, 100)
    : (currentLineIndex / totalLines) * 100;

  const handleFreeTalkInput = async (input: string) => {
    setState("partner_turn");
    setIsAiThinking(true);
    const rt = turnStartTime ? (Date.now() - turnStartTime) / 1000 : 0;
    setCurrentResponseTime(rt);

    try {
      const res = await api.post("/api/chat/free-talk", {
        conversation_id: params.id as string,
        user_input: input,
        history: chatHistory.map(h => ({ role: h.role, content: h.content })),
        role_played: myRole
      });
      const response = res.data as any;

      const newEntry: ChatMessage = { role: "user", content: input, evaluation: response.evaluation };
      const aiEntry: ChatMessage = { role: "model", content: response.reply };
      
      setChatHistory(prev => [...prev, newEntry, aiEntry]);
      setScores(prev => [...prev, {
        lineIndex: chatHistory.length,
        score: response.evaluation.score || 80,
        transcript: input,
        details: { wordDetails: [] },
        responseTime: rt
      }]);

      setState("scored");
      setIsAiThinking(false);
      speakWithTTS(response.reply);
    } catch (err) {
      console.error(err);
      setState("your_turn");
      setIsAiThinking(false);
    }
  };

  const processSpeechResult = useCallback((text: string) => {
    if (!text || state !== "listening") return;

    if (practiceMode === 5) {
      handleFreeTalkInput(text);
    } else if (currentLine) {
      const rt = practiceMode === 4
        ? speedTapTimeRef.current ?? (turnStartTime ? (Date.now() - turnStartTime) / 1000 : 0)
        : turnStartTime ? (Date.now() - turnStartTime) / 1000 : 0;
      const result = scorePronunciation(currentLine.text_en, text);
      setScores((prev) => [...prev, {
        lineIndex: currentLineIndex,
        score: result.score,
        transcript: text,
        details: result,
        responseTime: rt
      }]);
      setCurrentResponseTime(rt);
      speedTapTimeRef.current = null;
      setState("scored");
    }
  }, [state, practiceMode, currentLine, currentLineIndex, turnStartTime]);

  const advanceAfterPartner = useCallback(() => {
    const nextIndex = currentLineIndex + 1;
    if (conv && nextIndex < totalLines) {
      setCurrentLineIndex(nextIndex);
      const nextLine = conv.lines[nextIndex];
      if (nextLine.speaker === myRole) {
        setState("your_turn");
        setTurnStartTime(Date.now());
      } else {
        setState("partner_turn");
      }
    } else {
      setState("completed");
    }
  }, [currentLineIndex, totalLines, conv, myRole]);

  const speakWithTTS = useCallback(
    (text: string, isPartner = false) => {
      window.speechSynthesis.cancel(); // Clear any pending speech
      setIsPlaying(true);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      utterance.onend = () => {
        setIsPlaying(false);
        if (isPartner && practiceMode !== 5) {
          advanceAfterPartner();
        }
      };
      setTimeout(() => {
        window.speechSynthesis.speak(utterance);
      }, 50);
    },
    [advanceAfterPartner, practiceMode]
  );

  const playAudio = useCallback(
    (line: Line, isPartner = true) => {
      if (audioRef.current) audioRef.current.pause();
      
      const audioUrl = line.audio_url ? `${API_URL}${line.audio_url}` : null;
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setIsPlaying(true);
        audio.onended = () => { setIsPlaying(false); if (isPartner) advanceAfterPartner(); };
        audio.onerror = () => { setIsPlaying(false); speakWithTTS(line.text_en, isPartner); };
        audio.play().catch(() => { setIsPlaying(false); speakWithTTS(line.text_en, isPartner); });
      } else {
        speakWithTTS(line.text_en, isPartner);
      }
    },
    [advanceAfterPartner, practiceMode, speakWithTTS]
  );

  const isReplayDisabled = state === "partner_turn" || isAiThinking;

  const replayText = useCallback(
    (text: string) => {
      if (isReplayDisabled) return;
      speakWithTTS(text, false);
    },
    [isReplayDisabled, speakWithTTS]
  );

  const replayLine = useCallback(
    (line: Line) => {
      if (isReplayDisabled) return;
      playAudio(line, false);
    },
    [isReplayDisabled, playAudio]
  );

  useEffect(() => {
    if (state === "partner_turn" && currentLine && !isMyTurn && practiceMode !== 5) {
      const timer = setTimeout(() => playAudio(currentLine, true), 600);
      return () => clearTimeout(timer);
    }
  }, [state, currentLine, isMyTurn, playAudio, practiceMode]);

  useEffect(() => {
    if (transcript && state === "listening") {
      processSpeechResult(transcript);
    }
  }, [transcript]);

  // Fallback: if STT stopped (sttActive=false) but produced no transcript,
  // return user to "your_turn" so they can try again.
  useEffect(() => {
    if (!sttActive && state === "listening" && !transcript) {
      setState("your_turn");
      setTurnStartTime(Date.now());
    }
  }, [sttActive, state, transcript]);

  useEffect(() => {
    let timer: any;
    if (state === "your_turn" && practiceMode === 4) {
      setTimeLeft(SPEED_DRILL_TIMEOUT);
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0.1) {
            clearInterval(timer);
            handleTimeout();
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [state, practiceMode, currentLineIndex]);

  useEffect(() => {
    let timer: any;
    if (state === "your_turn" && practiceMode !== 4) {
      setElapsedTime(0);
      timer = setInterval(() => {
        if (turnStartTime) {
          setElapsedTime((Date.now() - turnStartTime) / 1000);
        }
      }, 100);
    }
    return () => clearInterval(timer);
  }, [state, practiceMode, turnStartTime]);

  function handleTimeout() {
    if (state !== "your_turn") return;
    setScores((prev) => [...prev, {
      lineIndex: currentLineIndex,
      score: 0,
      transcript: "[Time Out]",
      details: { wordDetails: [] },
      responseTime: SPEED_DRILL_TIMEOUT,
    }]);
    setCurrentResponseTime(SPEED_DRILL_TIMEOUT);
    setState("scored");
  }

  const handleStart = () => {
    setCurrentLineIndex(0);
    setScores([]);
    setChatHistory([]);
    setMasteryResult(null);
    speedTapTimeRef.current = null;
    if (practiceMode === 5) {
      if (myRole === "B") {
        setIsAiThinking(true);
        api.post("/api/chat/free-talk", {
           conversation_id: params.id as string,
           user_input: "Hello! Let's start the conversation.",
           history: [],
           role_played: "B"
        }).then(res => {
           const response = res.data as any;
           setChatHistory([{ role: "model", content: response.reply }]);
           speakWithTTS(response.reply);
           setState("your_turn");
           setTurnStartTime(Date.now());
        }).finally(() => setIsAiThinking(false));
      } else {
        setState("your_turn");
        setTurnStartTime(Date.now());
      }
    } else if (conv) {
      const firstLine = conv.lines[0];
      if (firstLine.speaker === myRole) {
        setState("your_turn");
        setTurnStartTime(Date.now());
      } else {
        setState("partner_turn");
      }
    }
  };

  const moveToNext = () => {
    if (practiceMode === 5) {
      setState("your_turn");
      setTurnStartTime(Date.now());
      return;
    }
    const nextIndex = currentLineIndex + 1;
    if (conv && nextIndex < totalLines) {
      setCurrentLineIndex(nextIndex);
      const nextLine = conv.lines[nextIndex];
      if (nextLine.speaker === myRole) {
        setState("your_turn");
        setTurnStartTime(Date.now());
      } else {
        setState("partner_turn");
      }
    } else {
      setState("completed");
    }
  };

  const handleSpeak = () => {
    speedTapTimeRef.current = practiceMode === 4 && turnStartTime
      ? (Date.now() - turnStartTime) / 1000
      : null;
    resetSpeech();
    setState("listening");
    startListening();
  };
  const handleRetry = () => {
    if (practiceMode === 5) {
      setChatHistory(prev => prev.slice(0, -2));
      setScores(prev => prev.slice(0, -1));
    } else {
      setScores((prev) => prev.filter((s) => s.lineIndex !== currentLineIndex));
    }
    resetSpeech();
    setState("your_turn");
    setTurnStartTime(Date.now());
  };

  const handleSkip = () => {
    if (state !== "your_turn") return;
    const rt = turnStartTime ? (Date.now() - turnStartTime) / 1000 : 0;
    setScores((prev) => [...prev, {
      lineIndex: currentLineIndex,
      score: 0,
      transcript: "[Skipped]",
      details: { wordDetails: [] },
      responseTime: rt
    }]);
    resetSpeech();
    stopListening();

    const nextIndex = currentLineIndex + 1;
    if (conv && nextIndex < totalLines) {
      setCurrentLineIndex(nextIndex);
      const nextLine = conv.lines[nextIndex];
      if (nextLine.speaker === myRole) {
        setState("your_turn");
        setTurnStartTime(Date.now());
      } else {
        setState("partner_turn");
      }
    } else {
      setState("completed");
    }
  };

  const handleComplete = useCallback(async () => {
    if (!conv) return;
    const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)
        : undefined;
    try {
      const saveRes = await api.post("/api/progress", {
        conversation_id: conv.id,
        role_played: myRole,
        completed_lines: practiceMode === 5 ? scores.length : myLinesCount,
        total_lines: practiceMode === 5 ? scores.length : myLinesCount,
        is_completed: true,
        pronunciation_score: avgScore,
        practice_mode: practiceMode,
        response_times: scores.map(s => s.responseTime)
      });
      const result = saveRes.data;
      setMasteryResult(result);
      qc.invalidateQueries({ queryKey: ["progress", "mastery"] });
      
      // Always reload mastery map to get properly merged data across roles
      const masteryRes = await api.get("/api/progress/mastery").catch(() => null);
      const masteryMapData = masteryRes?.data as Record<string, MasteryData> | null;
      if (masteryMapData && masteryMapData[conv.id]) {
        setLocalMasteryData(masteryMapData[conv.id]);
      } else {
        setLocalMasteryData(result);
      }
    } catch { }
  }, [conv, myRole, practiceMode, scores, myLinesCount, totalLines, qc]);

  useEffect(() => {
    if (state === "completed") handleComplete();
  }, [state, handleComplete]);

  useEffect(() => {
    chatAreaRef.current?.scrollTo({
      top: chatAreaRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [currentLineIndex, chatHistory.length, scores.length, state]);

  const handleStop = () => {
    // stopListening() calls recognition.stop() which triggers onend,
    // which sets `transcript` with the accumulated text.
    // The useEffect watching `transcript` will then call processSpeechResult.
    stopListening();
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
      }
      window.speechSynthesis.cancel();
      stopListening();
    };
  }, [stopListening]);

  useEffect(() => {
    if (state === "select_role" || state === "completed") {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
      }
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      stopListening();
      resetSpeech();
    }
  }, [state, stopListening, resetSpeech]);

  if (loading) return <PracticeSkeleton />;
  if (!conv) return <div className="empty-state"><h3>Conversation not found</h3></div>;

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
                 <div className={styles.finalStatText}>Score</div>
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
              <div className={styles.masteryBarLg}><div className={styles.masteryFillLg} style={{ width: `${mastery}%`, background: mastery >= 95 ? "linear-gradient(90deg, #10b981, #059669)" : "linear-gradient(90deg, var(--primary), var(--primary-600))" }} /></div>
              <div className={styles.masteryStats}><span className={styles.masteryLevel}>{mastery.toFixed(1)}%</span><span className={styles.masteryDetail}>🔥 Streak: {streak}/5</span><span className={styles.masteryDetail}>📖 Level: {practiceMode}/{RELEASED_MODE_COUNT}</span></div>
            </div>
          )}
          <div className={styles.completedActions}>
            <button className="btn btn-primary btn-lg" onClick={() => setState("select_role")}><ArrowRightLeft size={18} /> Swap Role & Retry</button>
            <button className="btn btn-secondary btn-lg" onClick={handleStart}><RotateCcw size={18} /> Practice Again</button>
            <Link href="/topics" className="btn btn-ghost btn-lg">Back to Topics</Link>
          </div>
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
          {conv.situation && <p className={styles.situation}>📍 {conv.situation}</p>}
          <div className={styles.selectionSection}>
            <h2 className={styles.selectTitle}>Choose Your Role</h2>
            <div className={styles.roleGrid}>
              <button className={`${styles.roleCard} ${myRole === "A" ? styles.roleActive : ""}`} onClick={() => setMyRole("A")}><div className={styles.roleAvatar}>A</div><div className={styles.roleName}>{conv.role_a_name}</div></button>
              <button className={`${styles.roleCard} ${myRole === "B" ? styles.roleActive : ""}`} onClick={() => setMyRole("B")}><div className={styles.roleAvatar}>B</div><div className={styles.roleName}>{conv.role_b_name}</div></button>
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
                if (MODE_REQUIRED_SUCCESSES[m.id]) {
                  progressValue = Math.min(Math.round((successCount / required) * 100), 100);
                  progressLabel = `${successCount}/${required}`;
                } else if (m.id === 5) {
                  progressLabel = "Soon";
                }
                const prevMode = MODES.find(mod => mod.id === m.id - 1);
                const unlockRequirement = m.id === 5
                  ? "Coming soon: AI free conversation is in development"
                  : m.id === 4
                    ? "Unlock: Score 90%+ x3 in Listener"
                    : `Unlock: Score 90%+ x${MODE_REQUIRED_SUCCESSES[m.id - 1] || 1} in ${prevMode?.name || "previous level"}`;
                const roleProgress = MODE_REQUIRED_SUCCESSES[m.id]
                  ? getRoleProgress(m.id, currentModeData)
                  : null;

                return (
                  <button 
                    key={m.id} 
                    className={`${styles.modeItem} ${practiceMode === m.id ? styles.modeActive : ""} ${isLocked ? styles.modeLocked : ""}`} 
                    onClick={() => !isLocked && setPracticeMode(m.id)} 
                    disabled={isLocked}
                    style={{
                      '--unlock-progress': `${progressValue}%`
                    } as any}
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
          <button className="btn btn-primary btn-lg" style={{ width: "100%" }} onClick={handleStart}><Play size={18} /> Start Practice</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.container} animate-fade-in`}>
      <div className={styles.topBar}>
        <button className="btn btn-ghost btn-sm" onClick={() => setState("select_role")}><ArrowLeft size={16} /> Exit</button>
        <div className={styles.modeBadgeTop}>{MODES.find(m => m.id === practiceMode)?.name}</div>
        {practiceMode === 5 ? (
           <button className="btn btn-success btn-sm" onClick={() => setState("completed")}>Finish Practice</button>
        ) : (
          <div className={styles.progressInfo}>{currentLineIndex + 1} / {totalLines}</div>
        )}
      </div>

      <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>

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
            <div className={styles.micActive} onClick={handleStop} style={{ cursor: 'pointer' }} title="Click to stop">
              <div className={styles.micRing} />
              <div className={styles.micRing2} />
              <Mic size={28} />
            </div>
            <div className={styles.transcriptLive}>{interimTranscript || "Listening..."}</div>
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
                            {lastScore.details.wordDetails.map((w: any, i: number) => (
                              <span key={i} className={w.matched ? styles.wordMatch : styles.wordMiss}>{w.word}</span>
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
