import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { ArrowLeft, Check, Lock, Mic, Play, RefreshCw, RotateCcw, Sparkles, Timer, Trophy, Volume2, Zap } from 'lucide-react-native';
import { API_URL, endpoints } from '../../lib/api';

const PRIMARY = '#ea3b92';
const SPEED_DRILL_TIMEOUT = 3;
const MODES = [
  { id: 1, name: 'Shadow Master', desc: 'Listen and repeat to mimic natural rhythm.' },
  { id: 2, name: 'Reader', desc: 'Practice with the dialogue text visible.' },
  { id: 3, name: 'Listener', desc: 'Respond after listening without seeing your line.' },
  { id: 4, name: 'Speed Talker', desc: 'Respond within 3 seconds to build reflexes.' },
  { id: 5, name: 'Fluent', desc: 'Free conversation with AI on this topic.' },
];
const MODE_REQUIRED_SUCCESSES: Record<number, number> = { 1: 3, 2: 3, 3: 3, 4: 5 };
const ROLE_SUCCESS_CAP = 2;

type PracticeState = 'select_role' | 'partner_turn' | 'your_turn' | 'listening' | 'scored' | 'completed';

function normalize(text: string) {
  return text.toLowerCase().replace(/[^\w\s']/g, '').split(/\s+/).filter(Boolean);
}

function scorePronunciation(expected: string, actual: string) {
  const expectedWords = normalize(expected);
  const actualWords = normalize(actual);
  let matches = 0;
  const wordDetails = expectedWords.map((word, index) => {
    const matched = actualWords[index] === word || actualWords.includes(word);
    if (matched) matches += 1;
    return { word, matched };
  });
  const score = expectedWords.length ? Math.round((matches / expectedWords.length) * 100) : 0;
  return { score, wordDetails };
}

function getRoleProgress(modeData?: { role_success_counts?: Record<string, number> }) {
  const roleCounts = modeData?.role_success_counts || {};
  return {
    a: Math.min(roleCounts.A || 0, ROLE_SUCCESS_CAP),
    b: Math.min(roleCounts.B || 0, ROLE_SUCCESS_CAP),
  };
}

export default function PracticeScreen() {
  const { id } = useLocalSearchParams();
  const conversationId = String(id);
  const [conv, setConv] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [masteryData, setMasteryData] = useState<any>(null);
  const [masteryResult, setMasteryResult] = useState<any>(null);
  const [myRole, setMyRole] = useState<'A' | 'B'>('B');
  const [practiceMode, setPracticeMode] = useState(1);
  const [state, setState] = useState<PracticeState>('select_role');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scores, setScores] = useState<any[]>([]);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [typedInput, setTypedInput] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [turnStartTime, setTurnStartTime] = useState<number | null>(null);
  const [currentResponseTime, setCurrentResponseTime] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SPEED_DRILL_TIMEOUT);
  const soundRef = useRef<Audio.Sound | null>(null);
  const chatScrollRef = useRef<ScrollView | null>(null);

  useSpeechRecognitionEvent('start', () => {
    setIsRecording(true);
    setSpeechError('');
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript || '';
    if (!transcript) return;
    setTypedInput(transcript);
    if (event.isFinal) {
      submitAnswer(transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsRecording(false);
    setSpeechError(event.message || 'Speech recognition failed.');
    setState('your_turn');
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      endpoints.getConversation(conversationId),
      endpoints.getMasteryMap().catch(() => ({ data: {} })),
    ])
      .then(([convRes, masteryRes]) => {
        setConv(convRes.data);
        const mastery = masteryRes.data?.[conversationId];
        setMasteryData(mastery);
        if (mastery?.current_mode) setPracticeMode(Math.min(mastery.current_mode, 5));
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    return () => {
      soundRef.current?.unloadAsync();
      Speech.stop();
      ExpoSpeechRecognitionModule.abort();
    };
  }, [id, conversationId]);

  const totalLines = conv?.lines?.length || 0;
  const currentLine = conv?.lines?.[currentIndex];
  const isMyTurn = currentLine?.speaker === myRole;
  const myLinesCount = useMemo(() => conv?.lines?.filter((l: any) => l.speaker === myRole).length || 0, [conv, myRole]);
  const progress = practiceMode === 5 ? Math.min((chatHistory.length / 10) * 100, 100) : totalLines ? (currentIndex / totalLines) * 100 : 0;

  const advanceAfterPartner = useCallback(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < totalLines) {
      setCurrentIndex(nextIdx);
      const nextLine = conv.lines[nextIdx];
      if (nextLine.speaker === myRole) {
        setState('your_turn');
        setTurnStartTime(Date.now());
      } else {
        setState('partner_turn');
      }
    } else {
      setState('completed');
    }
  }, [conv, currentIndex, myRole, totalLines]);

  const speakWithTTS = useCallback((text: string, advance = false) => {
    Speech.stop();
    setIsPlaying(true);
    Speech.speak(text, {
      language: 'en-US',
      rate: 0.9,
      onDone: () => {
        setIsPlaying(false);
        if (advance) advanceAfterPartner();
      },
      onError: () => {
        setIsPlaying(false);
        if (advance) advanceAfterPartner();
      },
    });
  }, [advanceAfterPartner]);

  const playAudio = useCallback(async (line: any, advance = true) => {
    setIsPlaying(true);
    try {
      if (soundRef.current) await soundRef.current.unloadAsync();
      if (line.audio_url) {
        const { sound } = await Audio.Sound.createAsync({ uri: `${API_URL}${line.audio_url}` }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            setIsPlaying(false);
            if (advance) advanceAfterPartner();
          }
        });
      } else {
        speakWithTTS(line.text_en, advance);
      }
    } catch {
      speakWithTTS(line.text_en, advance);
    }
  }, [advanceAfterPartner, speakWithTTS]);

  const isReplayDisabled = state === 'partner_turn' || isAiThinking;

  const replayText = useCallback((text: string) => {
    if (isReplayDisabled) return;
    speakWithTTS(text, false);
  }, [isReplayDisabled, speakWithTTS]);

  const replayLine = useCallback((line: any) => {
    if (isReplayDisabled) return;
    playAudio(line, false);
  }, [isReplayDisabled, playAudio]);

  useEffect(() => {
    if (state === 'partner_turn' && currentLine && !isMyTurn && practiceMode !== 5) {
      const timer = setTimeout(() => playAudio(currentLine, true), 450);
      return () => clearTimeout(timer);
    }
  }, [state, currentLine, isMyTurn, practiceMode, playAudio]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (state === 'your_turn' && practiceMode === 4) {
      setTimeLeft(SPEED_DRILL_TIMEOUT);
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 0.1) {
            clearInterval(timer);
            submitAnswer('[Time Out]');
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
    }
    return () => timer && clearInterval(timer);
  }, [state, practiceMode, currentIndex]);

  const handleStart = async () => {
    setCurrentIndex(0);
    setScores([]);
    setChatHistory([]);
    setMasteryResult(null);
    setTypedInput('');

    if (practiceMode === 5) {
      if (myRole === 'B') {
        setIsAiThinking(true);
        try {
          const res = await endpoints.sendFreeTalk({ conversation_id: conversationId, user_input: "Hello! Let's start the conversation.", history: [], role_played: myRole });
          setChatHistory([{ role: 'model', content: res.data.reply }]);
          speakWithTTS(res.data.reply, false);
        } finally {
          setIsAiThinking(false);
          setState('your_turn');
          setTurnStartTime(Date.now());
        }
      } else {
        setState('your_turn');
        setTurnStartTime(Date.now());
      }
      return;
    }

    const firstLine = conv.lines[0];
    if (firstLine.speaker === myRole) {
      setState('your_turn');
      setTurnStartTime(Date.now());
    } else {
      setState('partner_turn');
    }
  };

  const moveToNext = () => {
    setTypedInput('');
    if (practiceMode === 5) {
      setState('your_turn');
      setTurnStartTime(Date.now());
      return;
    }
    const nextIdx = currentIndex + 1;
    if (nextIdx < totalLines) {
      setCurrentIndex(nextIdx);
      const nextLine = conv.lines[nextIdx];
      if (nextLine.speaker === myRole) {
        setState('your_turn');
        setTurnStartTime(Date.now());
      } else {
        setState('partner_turn');
      }
    } else {
      setState('completed');
    }
  };

  const submitFreeTalk = async (text: string, responseTime: number) => {
    setState('partner_turn');
    setIsAiThinking(true);
    try {
      const res = await endpoints.sendFreeTalk({
        conversation_id: conversationId,
        user_input: text,
        history: chatHistory.map((m) => ({ role: m.role, content: m.content })),
        role_played: myRole,
      });
      const evaluation = res.data.evaluation || {};
      setChatHistory((prev) => [...prev, { role: 'user', content: text, evaluation }, { role: 'model', content: res.data.reply }]);
      setScores((prev) => [...prev, { lineIndex: prev.length, score: evaluation.score || 80, transcript: text, details: { wordDetails: [] }, responseTime }]);
      setState('scored');
      speakWithTTS(res.data.reply, false);
    } catch {
      setState('your_turn');
    } finally {
      setIsAiThinking(false);
    }
  };

  function submitAnswer(rawText?: string) {
    const text = (rawText ?? typedInput).trim();
    if (!text) return;
    const rt = turnStartTime ? (Date.now() - turnStartTime) / 1000 : 0;
    setCurrentResponseTime(rt);
    if (practiceMode === 5) {
      submitFreeTalk(text, rt);
      return;
    }
    const result = text === '[Time Out]' ? { score: 0, wordDetails: [] } : scorePronunciation(currentLine.text_en, text);
    setScores((prev) => [...prev, { lineIndex: currentIndex, score: result.score, transcript: text, details: result, responseTime: rt }]);
    setState('scored');
  }

  const startListening = async () => {
    try {
      setTypedInput('');
      setSpeechError('');
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setSpeechError('Microphone or speech recognition permission was denied.');
        return;
      }
      setState('listening');
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
      });
    } catch (error: any) {
      setSpeechError(error?.message || 'Speech recognition is unavailable on this device.');
      setState('your_turn');
    }
  };

  const stopListening = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  const saveProgress = useCallback(async () => {
    if (!conv) return;
    const avgScore = scores.length ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length) : undefined;
    try {
      const res = await endpoints.saveProgress({
        conversation_id: conv.id,
        role_played: myRole,
        completed_lines: practiceMode === 5 ? scores.length : myLinesCount,
        total_lines: practiceMode === 5 ? scores.length : myLinesCount,
        is_completed: true,
        pronunciation_score: avgScore,
        practice_mode: practiceMode,
        response_times: scores.map((item) => item.responseTime || 0),
      });
      setMasteryResult(res.data);
      const masteryRes = await endpoints.getMasteryMap().catch(() => null);
      setMasteryData(masteryRes?.data?.[conv.id] || res.data);
    } catch {
      // Progress saving should not block the completion screen.
    }
  }, [conv, myRole, myLinesCount, practiceMode, scores]);

  useEffect(() => {
    if (state === 'completed') saveProgress();
  }, [state, saveProgress]);

  useEffect(() => {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [currentIndex, chatHistory.length, scores.length, state]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={PRIMARY} /></View>;
  if (!conv) return <View style={styles.center}><Text>Conversation not found</Text></View>;

  if (state === 'completed') {
    const avgScore = scores.length ? Math.round(scores.reduce((sum, item) => sum + item.score, 0) / scores.length) : 0;
    const avgRT = scores.length ? scores.reduce((sum, item) => sum + (item.responseTime || 0), 0) / scores.length : 0;
    const mastery = masteryResult?.mastery_level || masteryData?.mastery_level || 0;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.complete}>
          <View style={styles.trophy}><Trophy size={44} color={PRIMARY} /></View>
          <Text style={styles.completeTitle}>Practice Complete!</Text>
          <Text style={styles.completeSub}>{conv.title}</Text>
          <View style={styles.finalStats}>
            <View style={styles.finalStat}><Text style={styles.finalNum}>{avgScore}%</Text><Text style={styles.finalLabel}>Score</Text></View>
            <View style={styles.finalStat}><Text style={styles.finalNum}>{avgRT.toFixed(1)}s</Text><Text style={styles.finalLabel}>Reflex</Text></View>
          </View>
          <View style={styles.masteryCard}>
            <Text style={styles.masteryTitle}>{mastery >= 95 ? 'Conversation Mastered' : 'Mastery Progress'}</Text>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${mastery}%` }]} /></View>
            <Text style={styles.masteryText}>{mastery.toFixed(1)}% · Mode {practiceMode}/5</Text>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setState('select_role')}><RefreshCw size={18} color="#fff" /><Text style={styles.primaryText}>Swap Role & Retry</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleStart}><RotateCcw size={18} color="#0f172a" /><Text style={styles.secondaryText}>Practice Again</Text></TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.push('/(tabs)/topics')}><Text style={styles.ghostText}>Back to Topics</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'select_role') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.selectContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}><ArrowLeft size={18} color="#0f172a" /><Text style={styles.backText}>Back to Topic</Text></TouchableOpacity>
          <Text style={styles.title}>{conv.title}</Text>
          {!!conv.situation && <Text style={styles.situation}>{conv.situation}</Text>}
          <Text style={styles.sectionTitle}>Choose Your Role</Text>
          <View style={styles.roleGrid}>
            {(['A', 'B'] as const).map((role) => (
              <TouchableOpacity key={role} style={[styles.roleCard, myRole === role && styles.roleActive]} onPress={() => setMyRole(role)}>
                <View style={styles.roleAvatar}><Text style={styles.roleAvatarText}>{role}</Text></View>
                <Text style={styles.roleName}>{role === 'A' ? conv.role_a_name : conv.role_b_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.sectionTitle}>Practice Mode</Text>
          <View style={styles.modeList}>
            {MODES.map((mode) => {
              const unlocked = mode.id <= (masteryData?.current_mode || 1);
              const currentModeData = masteryData?.mode_scores?.[String(mode.id)];
              const previousModeData = masteryData?.mode_scores?.[String(mode.id - 1)];
              const count = unlocked ? (currentModeData?.success_count || 0) : (previousModeData?.success_count || 0);
              const required = MODE_REQUIRED_SUCCESSES[unlocked ? mode.id : mode.id - 1] || 1;
              const detailMode = unlocked ? mode.id : mode.id - 1;
              const detailData = unlocked ? currentModeData : previousModeData;
              const roleProgress = (MODE_REQUIRED_SUCCESSES[detailMode] || 0) === 3 ? getRoleProgress(detailData) : null;
              return (
                <TouchableOpacity
                  key={mode.id}
                  disabled={!unlocked}
                  style={[styles.modeItem, practiceMode === mode.id && styles.modeActive, !unlocked && styles.modeLocked]}
                  onPress={() => setPracticeMode(mode.id)}
                >
                  <View style={styles.modeNumber}><Text style={styles.modeNumberText}>{mode.id}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modeName}>{mode.name}</Text>
                    <Text style={styles.modeDesc}>{unlocked ? mode.desc : `Unlock with 90%+ perfect sessions in Mode ${mode.id - 1}`}</Text>
                    {!!roleProgress && (
                      <View style={styles.modeRoleProgress}>
                        <Text style={[styles.modeRoleChip, roleProgress.a > 0 ? styles.modeRoleActive : styles.modeRoleInactive]}>Role A</Text>
                        <Text style={[styles.modeRoleChip, roleProgress.b > 0 ? styles.modeRoleActive : styles.modeRoleInactive]}>Role B</Text>
                        <Text style={styles.modeRoleHint}>Need both</Text>
                      </View>
                    )}
                  </View>
                  {unlocked ? <Text style={styles.modeProgress}>{mode.id === 5 ? 'Fluent' : `${count}/${required}`}</Text> : <Lock size={16} color="#94a3b8" />}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleStart}><Play size={18} color="#fff" /><Text style={styles.primaryText}>Start Practice</Text></TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const lastScore = scores[scores.length - 1];
  const lastEval = practiceMode === 5 ? chatHistory[chatHistory.length - 2]?.evaluation : null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => setState('select_role')} style={styles.topButton}><ArrowLeft size={18} color="#0f172a" /><Text style={styles.topButtonText}>Exit</Text></TouchableOpacity>
          <Text style={styles.modeTop}>{MODES.find((m) => m.id === practiceMode)?.name}</Text>
          {practiceMode === 5 ? (
            <TouchableOpacity onPress={() => setState('completed')}><Text style={styles.finishText}>Finish</Text></TouchableOpacity>
          ) : (
            <Text style={styles.progressText}>{currentIndex + 1}/{totalLines}</Text>
          )}
        </View>
        <View style={styles.progressTrackSmall}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

        <ScrollView ref={chatScrollRef} style={styles.chatArea} contentContainerStyle={styles.chatContent}>
          {practiceMode === 5 ? chatHistory.map((message, index) => (
            <View key={`${message.role}-${index}`} style={[styles.bubble, message.role === 'user' ? styles.bubbleMine : styles.bubblePartner]}>
              <Text style={[styles.bubbleRole, message.role === 'user' && styles.bubbleRoleMine]}>{message.role === 'user' ? 'You' : 'AI'}</Text>
              <Text style={[styles.bubbleText, message.role === 'user' && styles.bubbleTextMine]}>{message.content}</Text>
              <TouchableOpacity style={[styles.replayBtn, isReplayDisabled && styles.replayBtnDisabled]} onPress={() => replayText(message.content)} disabled={isReplayDisabled}><Volume2 size={14} color={message.role === 'user' ? '#fff' : '#64748b'} /></TouchableOpacity>
            </View>
          )) : conv.lines.slice(0, currentIndex + 1).map((line: any, index: number) => {
            const mine = line.speaker === myRole;
            const current = index === currentIndex;
            const lineScore = scores.find((score) => score.lineIndex === index);
            const hideText = practiceMode === 3 && mine && current && state !== 'scored';
            return (
              <View key={line.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubblePartner, current && styles.bubbleCurrent, !current && { opacity: 0.65 }]}>
                <Text style={[styles.bubbleRole, mine && styles.bubbleRoleMine]}>{line.speaker === 'A' ? conv.role_a_name : conv.role_b_name}</Text>
                <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{hideText ? 'Listen and respond...' : line.text_en}</Text>
                {practiceMode !== 2 && <TouchableOpacity style={[styles.replayBtn, isReplayDisabled && styles.replayBtnDisabled]} onPress={() => replayLine(line)} disabled={isReplayDisabled}><Volume2 size={14} color={mine ? '#fff' : '#64748b'} /></TouchableOpacity>}
                {lineScore && <Text style={[styles.bubbleMeta, mine && styles.bubbleTextMine]}>{lineScore.score}% · {lineScore.responseTime.toFixed(1)}s</Text>}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.actionArea}>
          {(state === 'partner_turn' || isAiThinking) && (
            <View style={styles.actionMessage}><Volume2 size={20} color={PRIMARY} /><Text style={styles.actionMessageText}>{isAiThinking ? 'AI is thinking...' : isPlaying ? 'Partner is speaking...' : 'Preparing...'}</Text></View>
          )}
          {state === 'your_turn' && (
            <View>
              <View style={styles.timerRow}>
                {practiceMode === 4 ? <><Zap size={14} color="#ef4444" /><Text style={styles.timerUrgent}>{timeLeft.toFixed(1)}s remaining</Text></> : <><Timer size={14} color="#64748b" /><Text style={styles.timerText}>Your turn</Text></>}
              </View>
              {!!speechError && <Text style={styles.speechError}>{speechError}</Text>}
              <View style={styles.inputRow}>
                <TextInput value={typedInput} onChangeText={setTypedInput} placeholder={practiceMode === 5 ? 'Type your reply...' : 'Type what you said...'} style={styles.answerInput} multiline />
                <TouchableOpacity style={styles.micSmallBtn} onPress={startListening}><Mic size={20} color={PRIMARY} /></TouchableOpacity>
                <TouchableOpacity style={styles.sendBtn} onPress={() => submitAnswer()}><Check size={20} color="#fff" /></TouchableOpacity>
              </View>
            </View>
          )}
          {state === 'listening' && (
            <View style={styles.listeningBox}>
              <TouchableOpacity style={styles.micActive} onPress={stopListening}>
                <Mic size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.listeningTitle}>{isRecording ? 'Listening...' : 'Starting microphone...'}</Text>
              <Text style={styles.liveTranscript}>{typedInput || 'Speak your English line now.'}</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={stopListening}>
                <Text style={styles.secondaryText}>Stop & Process</Text>
              </TouchableOpacity>
            </View>
          )}
          {state === 'scored' && (
            <View>
              <View style={styles.scorePanel}>
                <View style={styles.scoreHeader}>
                  <Text style={styles.scoreCircle}>{lastEval?.score || lastScore?.score || 0}%</Text>
                  <Text style={styles.rtBadge}>{currentResponseTime.toFixed(1)}s</Text>
                  {practiceMode === 5 && <View style={styles.aiBadge}><Sparkles size={12} color="#7c3aed" /><Text style={styles.aiBadgeText}>AI</Text></View>}
                </View>
                <Text style={styles.transcript}>"{lastScore?.transcript || chatHistory[chatHistory.length - 2]?.content}"</Text>
                {lastEval ? (
                  <Text style={styles.feedback}>{lastEval.overall_feedback || lastEval.grammar_feedback || 'Good practice.'}</Text>
                ) : (
                  <View style={styles.wordResults}>
                    {(lastScore?.details?.wordDetails || []).map((word: any, index: number) => <Text key={`${word.word}-${index}`} style={word.matched ? styles.wordMatch : styles.wordMiss}>{word.word}</Text>)}
                  </View>
                )}
              </View>
              <View style={styles.scoredActions}>
                <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={moveToNext}><Check size={16} color="#fff" /><Text style={styles.primaryText}>Continue</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.secondaryBtn, { flex: 1 }]} onPress={() => { setTypedInput(''); setState('your_turn'); setTurnStartTime(Date.now()); }}><RotateCcw size={16} color="#0f172a" /><Text style={styles.secondaryText}>Retry</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  selectContent: { padding: 20, gap: 16, paddingBottom: 32 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: '#0f172a', fontWeight: '700' },
  title: { color: '#0f172a', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  situation: { color: '#64748b', textAlign: 'center', lineHeight: 21 },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900', marginTop: 6 },
  roleGrid: { flexDirection: 'row', gap: 12 },
  roleCard: { flex: 1, backgroundColor: '#fff', borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 16, padding: 18, alignItems: 'center' },
  roleActive: { borderColor: PRIMARY, backgroundColor: '#fdf2f8' },
  roleAvatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  roleAvatarText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  roleName: { color: '#0f172a', fontWeight: '800', textAlign: 'center' },
  modeList: { gap: 10 },
  modeItem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  modeActive: { borderColor: PRIMARY, backgroundColor: '#fdf2f8' },
  modeLocked: { opacity: 0.55 },
  modeNumber: { width: 34, height: 34, borderRadius: 17, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  modeNumberText: { color: '#fff', fontWeight: '900' },
  modeName: { color: '#0f172a', fontWeight: '900' },
  modeDesc: { color: '#64748b', fontSize: 13, marginTop: 3 },
  modeRoleProgress: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  modeRoleChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, fontSize: 11, fontWeight: '900', overflow: 'hidden' },
  modeRoleActive: { color: PRIMARY, backgroundColor: '#fce7f3' },
  modeRoleInactive: { color: '#94a3b8', backgroundColor: '#f1f5f9' },
  modeRoleHint: { color: '#94a3b8', fontSize: 11, fontWeight: '800' },
  modeProgress: { color: PRIMARY, fontWeight: '900', fontSize: 12 },
  primaryBtn: { backgroundColor: PRIMARY, borderRadius: 14, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondaryBtn: { backgroundColor: '#f1f5f9', borderRadius: 14, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  secondaryText: { color: '#0f172a', fontWeight: '900', fontSize: 16 },
  ghostBtn: { padding: 14, alignItems: 'center' },
  ghostText: { color: '#64748b', fontWeight: '800' },
  topBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  topButtonText: { color: '#0f172a', fontWeight: '800' },
  modeTop: { color: PRIMARY, fontWeight: '900', maxWidth: 150, textAlign: 'center' },
  finishText: { color: '#10b981', fontWeight: '900' },
  progressText: { color: '#64748b', fontWeight: '900' },
  progressTrackSmall: { height: 4, backgroundColor: '#e2e8f0' },
  progressTrack: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: PRIMARY, borderRadius: 999 },
  chatArea: { flex: 1 },
  chatContent: { padding: 16, paddingBottom: 24 },
  bubble: { maxWidth: '88%', padding: 14, borderRadius: 18, marginBottom: 12, position: 'relative' },
  bubblePartner: { alignSelf: 'flex-start', backgroundColor: '#e2e8f0', borderBottomLeftRadius: 4 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: PRIMARY, borderBottomRightRadius: 4 },
  bubbleCurrent: { borderWidth: 2, borderColor: '#cbd5e1' },
  bubbleRole: { color: '#475569', fontSize: 11, fontWeight: '900', marginBottom: 4, textTransform: 'uppercase' },
  bubbleRoleMine: { color: '#fce7f3' },
  bubbleText: { color: '#0f172a', fontSize: 16, lineHeight: 22 },
  bubbleTextMine: { color: '#fff' },
  replayBtn: { alignSelf: 'flex-end', marginTop: 8 },
  replayBtnDisabled: { opacity: 0.25 },
  bubbleMeta: { marginTop: 8, fontWeight: '800', fontSize: 12 },
  actionArea: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 16 },
  actionMessage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52 },
  actionMessageText: { color: '#64748b', fontWeight: '800' },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 },
  timerText: { color: '#64748b', fontWeight: '800' },
  timerUrgent: { color: '#ef4444', fontWeight: '900' },
  speechError: { color: '#b91c1c', backgroundColor: '#fee2e2', borderRadius: 10, padding: 10, marginBottom: 10, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  answerInput: { flex: 1, minHeight: 48, maxHeight: 110, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0f172a', backgroundColor: '#f8fafc' },
  micSmallBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: '#fbcfe8', alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: PRIMARY, alignItems: 'center', justifyContent: 'center' },
  listeningBox: { alignItems: 'center', gap: 10 },
  micActive: { width: 74, height: 74, borderRadius: 37, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  listeningTitle: { color: '#0f172a', fontSize: 17, fontWeight: '900' },
  liveTranscript: { color: '#64748b', textAlign: 'center', minHeight: 22 },
  scorePanel: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  scoreCircle: { backgroundColor: PRIMARY, color: '#fff', fontWeight: '900', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  rtBadge: { backgroundColor: '#fffbeb', color: '#92400e', fontWeight: '900', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3e8ff', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999 },
  aiBadgeText: { color: '#7c3aed', fontWeight: '900', fontSize: 12 },
  transcript: { color: '#0f172a', fontWeight: '700', marginBottom: 8 },
  feedback: { color: '#64748b', lineHeight: 20 },
  wordResults: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wordMatch: { color: '#047857', backgroundColor: '#dcfce7', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, fontWeight: '800' },
  wordMiss: { color: '#b91c1c', backgroundColor: '#fee2e2', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, fontWeight: '800' },
  scoredActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  complete: { flex: 1, justifyContent: 'center', padding: 22, gap: 14 },
  trophy: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#fdf2f8', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  completeTitle: { color: '#0f172a', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  completeSub: { color: '#64748b', textAlign: 'center' },
  finalStats: { flexDirection: 'row', gap: 12 },
  finalStat: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
  finalNum: { color: '#0f172a', fontSize: 28, fontWeight: '900' },
  finalLabel: { color: '#64748b', fontWeight: '800' },
  masteryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f1f5f9', gap: 8 },
  masteryTitle: { color: '#0f172a', fontWeight: '900' },
  masteryText: { color: '#64748b', fontWeight: '800', textAlign: 'right' },
});
