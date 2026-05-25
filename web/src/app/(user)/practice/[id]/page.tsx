"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, API_URL } from "@/lib/api";
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
  { id: 1, name: "Shadow Master", desc: "Listen and repeat simultaneously to mimic natural rhythm.", icon: "1" },
  { id: 2, name: "Reader", desc: "Practice speaking with the support of dialogue text.", icon: "2" },
  { id: 3, name: "Listener", desc: "Listen to your partner and respond without seeing text.", icon: "3" },
  { id: 4, name: "Speed Talker", desc: "Respond within 3 seconds to build lightning reflexes.", icon: "4" },
  { id: 5, name: "Fluent", desc: "Free conversation with AI to master the topic.", icon: "5" },
];

const MODE_REQUIRED_SUCCESSES: Record<number, number> = {
  1: 3,
  2: 3,
  3: 3,
  4: 5,
};

const SPEED_DRILL_TIMEOUT = 3.0;

export default function PracticePage() {
  const params = useParams();
  const router = useRouter();

  const [conv, setConv] = useState<ConvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [masteryData, setMasteryData] = useState<any>(null);

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const {
    transcript,
    interimTranscript,
    start: startListening,
    stop: stopListening,
    reset: resetSpeech,
  } = useSpeechRecognition("en-US");

  useEffect(() => {
    if (params.id) {
      Promise.all([
        api.getConversation(params.id as string),
        api.getMasteryMap().catch(() => ({})),
      ])
        .then(([convData, masteryMap]: [any, any]) => {
          setConv(convData);
          const m = masteryMap[params.id as string];
          setMasteryData(m);
          if (m?.current_mode) {
            setPracticeMode(Math.min(m.current_mode, 5));
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [params.id]);

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
      const response = await api.sendFreeTalk({
        conversation_id: params.id as string,
        user_input: input,
        history: chatHistory.map(h => ({ role: h.role, content: h.content })),
        role_played: myRole
      }) as any;

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
      const rt = turnStartTime ? (Date.now() - turnStartTime) / 1000 : 0;
      const result = scorePronunciation(currentLine.text_en, text);
      setScores((prev) => [...prev, {
        lineIndex: currentLineIndex,
        score: result.score,
        transcript: text,
        details: result,
        responseTime: rt
      }]);
      setCurrentResponseTime(rt);
      setState("scored");
    }
    stopListening();
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
  }, [transcript, state, processSpeechResult]);

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

  const handleTimeout = () => {
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
  };

  const handleStart = () => {
    setCurrentLineIndex(0);
    setScores([]);
    setChatHistory([]);
    setMasteryResult(null);
    if (practiceMode === 5) {
      if (myRole === "B") {
        setIsAiThinking(true);
        api.sendFreeTalk({
           conversation_id: params.id as string,
           user_input: "Hello! Let's start the conversation.",
           history: [],
           role_played: "B"
        }).then(res => {
           const response = res as any;
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

  const handleSpeak = () => { resetSpeech(); setState("listening"); startListening(); };
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

  const handleComplete = useCallback(async () => {
    if (!conv) return;
    const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)
        : undefined;
    try {
      const result = await api.saveProgress({
        conversation_id: conv.id,
        role_played: myRole,
        completed_lines: practiceMode === 5 ? scores.length : myLinesCount,
        total_lines: practiceMode === 5 ? scores.length : myLinesCount,
        is_completed: true,
        pronunciation_score: avgScore,
        practice_mode: practiceMode,
        response_times: scores.map(s => s.responseTime)
      });
      setMasteryResult(result);
      // Always reload mastery map to get properly merged data across roles
      const masteryMap = await api.getMasteryMap().catch(() => null) as Record<string, MasteryData> | null;
      if (masteryMap && masteryMap[conv.id]) {
        setMasteryData(masteryMap[conv.id]);
      } else {
        setMasteryData(result);
      }
    } catch { }
  }, [conv, myRole, practiceMode, scores, myLinesCount, totalLines]);

  useEffect(() => {
    if (state === "completed") handleComplete();
  }, [state, handleComplete]);

  const handleStop = () => {
    stopListening();
    if (state === "listening") {
       const textToUse = transcript || interimTranscript;
       if (textToUse) {
          processSpeechResult(textToUse);
       } else {
          setState("your_turn");
          setTurnStartTime(Date.now());
       }
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
      window.speechSynthesis.cancel();
      stopListening();
    };
  }, [stopListening]);

  if (loading) return <div className="flex-center p-80"><div className="spinner spinner-lg" /></div>;
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
              <div className={styles.masteryStats}><span className={styles.masteryLevel}>{mastery.toFixed(1)}%</span><span className={styles.masteryDetail}>🔥 Streak: {streak}/5</span><span className={styles.masteryDetail}>📖 Mode: {practiceMode}/5</span></div>
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
            <h2 className={styles.selectTitle}>Practice Mode</h2>
            <div className={styles.modeList}>
              {MODES.map((m) => {
                const isUnlocked = m.id <= (masteryData?.current_mode || 1);
                const isLocked = !isUnlocked;
                
                let progressValue = 0;
                let progressLabel = "";
                if (isLocked && m.id > 1) {
                   const prevModeData = masteryData?.mode_scores?.[(m.id - 1).toString()];
                   if (m.id === 5 && prevModeData?.passed && prevModeData?.passed_at) {
                     const passedAt = new Date(prevModeData.passed_at).getTime();
                     const daysSincePassed = (Date.now() - passedAt) / 86400000;
                     progressLabel = `${Math.max(0, Math.floor(daysSincePassed))}/30 days`;
                   } else {
                     const successCount = prevModeData?.success_count || 0;
                     const required = MODE_REQUIRED_SUCCESSES[m.id - 1] || 1;
                     progressLabel = `${successCount}/${required}`;
                   }
                } else if (!isLocked) {
                   const currentModeData = masteryData?.mode_scores?.[m.id.toString()];
                   const successCount = currentModeData?.success_count || 0;
                   const required = MODE_REQUIRED_SUCCESSES[m.id] || 1;
                   progressValue = Math.min(Math.round((successCount / required) * 100), 100);
                   progressLabel = m.id === 5 ? "Fluent" : `${successCount}/${required}`;
                }
                const prevMode = MODES.find(mod => mod.id === m.id - 1);
                const unlockRequirement = m.id === 5
                  ? "Maintain Level 4 through SRS for 30 days"
                  : `Unlock: Score 90%+ x${MODE_REQUIRED_SUCCESSES[m.id - 1] || 1} in ${prevMode?.name || "previous level"}`;

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

      <div className={styles.chatArea}>
        {practiceMode === 5 ? (
          chatHistory.map((h, i) => (
            <div key={i} className={`${styles.bubble} ${h.role === "user" ? styles.bubbleMine : styles.bubblePartner}`}>
               <div className={styles.bubbleRole}>{h.role === "user" ? "You" : "AI"}</div>
               <div className={styles.bubbleContent}>
                 <p className={styles.bubbleText}>{h.content}</p>
                 <button className={styles.replayBtn} onClick={() => speakWithTTS(h.content, false)}><Volume2 size={14} /></button>
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
            return (
              <div key={line.id} className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubblePartner} ${isCurrent ? styles.bubbleCurrent : ""} ${isPast ? styles.bubblePast : ""}`}>
                <div className={styles.bubbleRole}>{line.speaker === "A" ? conv.role_a_name : conv.role_b_name}</div>
                <div className={styles.bubbleContent}>
                  {showText ? <p className={styles.bubbleText}>{line.text_en}</p> : <div className={styles.hiddenTextPlaceholder}><Zap size={14} /> Listen & respond...</div>}
                  {practiceMode !== 2 && (
                    <button className={styles.replayBtn} onClick={() => playAudio(line, false)}><Volume2 size={14} /></button>
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
                  <><Timer size={14} /> {( (Date.now() - (turnStartTime || 0)) / 1000 ).toFixed(1)}s</>
                )}
             </div>
             <div className={styles.actionButtons}>
                <button className={`btn btn-primary btn-lg ${styles.speakBtn}`} onClick={handleSpeak}><Mic size={22} /> Tap to Speak</button>
                {practiceMode !== 5 && <button className="btn btn-ghost btn-sm" onClick={() => resetSpeech()}><SkipForward size={16} /> Skip</button>}
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
                    <button className="btn btn-secondary" onClick={handleRetry}><RotateCcw size={16} /> Retry</button>
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
