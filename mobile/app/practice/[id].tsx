import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, SafeAreaView } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import api, { API_URL } from '../../lib/api';
import { Mic, Play, ArrowLeft, Volume2, SkipForward, RefreshCw } from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

// Function to simulate pronunciation scoring
const scorePronunciation = (expected: string, actual: string) => {
  // In a real app, this would use a Levenshtein distance algorithm as in web app.
  // Here we just return a mock random score for demonstration.
  const score = Math.floor(Math.random() * 30) + 70; // 70 to 100
  return score;
};

export default function PracticeScreen() {
  const { id } = useLocalSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [myRole, setMyRole] = useState<'A' | 'B'>('B');
  const [state, setState] = useState<'select_role' | 'partner_turn' | 'your_turn' | 'listening' | 'scored' | 'completed'>('select_role');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scores, setScores] = useState<any[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (id) {
      api.get(`/api/conversations/${id}`)
        .then(res => setData(res.data))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
    
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      Speech.stop();
    };
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ea3b92" />
      </View>
    );
  }

  if (!data) return <View style={styles.center}><Text>Error loading conversation</Text></View>;
  
  const totalLines = data.lines?.length || 0;
  const currentLine = data.lines?.[currentIndex];
  const isMyTurn = currentLine?.speaker === myRole;

  const playAudio = async (line: any) => {
    setIsPlaying(true);
    try {
      if (line.audio_url) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: `${API_URL}${line.audio_url}` },
          { shouldPlay: true }
        );
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            setIsPlaying(false);
            moveToNext(true);
          }
        });
      } else {
        Speech.speak(line.text_en, {
          onDone: () => {
            setIsPlaying(false);
            moveToNext(true);
          },
          onError: () => {
            setIsPlaying(false);
            moveToNext(true);
          }
        });
      }
    } catch (err) {
      console.error(err);
      setIsPlaying(false);
      moveToNext(true);
    }
  };

  const moveToNext = (automatic: boolean = false) => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < totalLines) {
      setCurrentIndex(nextIdx);
      const nextLine = data.lines[nextIdx];
      if (nextLine.speaker === myRole) {
        setState('your_turn');
      } else {
        setState('partner_turn');
      }
    } else {
      setState('completed');
    }
  };

  // Auto-play partner's audio
  useEffect(() => {
    if (state === 'partner_turn' && currentLine && !isMyTurn) {
      const timer = setTimeout(() => {
        playAudio(currentLine);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state, currentLine, isMyTurn]);

  const handleStart = () => {
    setCurrentIndex(0);
    setScores([]);
    const firstLine = data.lines[0];
    if (firstLine.speaker === myRole) {
      setState('your_turn');
    } else {
      setState('partner_turn');
    }
  };

  const startListening = () => {
    setState('listening');
    // Simulate recording duration and STT mock callback
    setTimeout(() => {
      const score = scorePronunciation(currentLine.text_en, "Mock transcript");
      setScores(prev => [...prev, { lineIndex: currentIndex, score }]);
      setState('scored');
    }, 2000);
  };

  const saveProgress = async () => {
    try {
      const myLinesCount = data.lines.filter((l: any) => l.speaker === myRole).length;
      const avgScore = scores.length > 0 
        ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length) 
        : 0;

      await api.post('/api/progress', {
        conversation_id: data.id,
        role_played: myRole,
        completed_lines: myLinesCount,
        total_lines: totalLines,
        is_completed: true,
        pronunciation_score: avgScore
      });
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    if (state === 'completed') {
      saveProgress();
    }
  }, [state]);

  // UI STATE: SELECT ROLE
  if (state === 'select_role') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft color="#0f172a" />
          </TouchableOpacity>
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{data.title}</Text>
          <Text style={styles.subtitle}>Choose your role</Text>

          <View style={styles.roleGrid}>
            <TouchableOpacity 
              style={[styles.roleCard, myRole === 'A' && styles.roleActive]}
              onPress={() => setMyRole('A')}
            >
              <View style={styles.roleAvatar}><Text style={styles.avatarText}>A</Text></View>
              <Text style={styles.roleName}>{data.role_a_name}</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.roleCard, myRole === 'B' && styles.roleActive]}
              onPress={() => setMyRole('B')}
            >
              <View style={styles.roleAvatar}><Text style={styles.avatarText}>B</Text></View>
              <Text style={styles.roleName}>{data.role_b_name}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleStart}>
            <Play color="#fff" />
            <Text style={styles.primaryBtnText}>Start Practice</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // UI STATE: COMPLETED
  if (state === 'completed') {
    const avgScore = scores.length > 0 
        ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length) 
        : 0;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.contentCentred}>
          <Text style={styles.title}>Practice Complete! 🎉</Text>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreNum}>{avgScore}%</Text>
          </View>
          
          <TouchableOpacity style={styles.primaryBtn} onPress={() => {
            setMyRole(myRole === 'A' ? 'B' : 'A');
            setState('select_role');
          }}>
            <RefreshCw color="#fff" size={20} />
            <Text style={styles.primaryBtnText}>Swap Role & Retry</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.primaryBtn, { backgroundColor: '#f1f5f9', marginTop: 12 }]} 
            onPress={() => router.back()}
          >
            <Text style={[styles.primaryBtnText, { color: '#0f172a' }]}>Back to Topics</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // UI STATE: PRACTICE IN PROGRESS
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setState('select_role')} style={styles.backBtn}>
          <ArrowLeft color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.progressText}>{currentIndex + 1} / {totalLines}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.chatArea} contentContainerStyle={{ padding: 16 }}>
        {data.lines.slice(0, currentIndex + 1).map((line: any, idx: number) => {
          const isMine = line.speaker === myRole;
          const isCurrent = idx === currentIndex;
          const lineScore = scores.find(s => s.lineIndex === idx);
          
          return (
            <View key={line.id} style={[
              styles.bubble,
              isMine ? styles.bubbleMine : styles.bubblePartner,
              isCurrent ? styles.bubbleCurrent : { opacity: 0.6 }
            ]}>
              <Text style={styles.bubbleRole}>
                {line.speaker === 'A' ? data.role_a_name : data.role_b_name}
              </Text>
              <Text style={[styles.bubbleText, isMine ? { color: '#fff' } : null]}>
                {line.text_en}
              </Text>
              {lineScore && (
                <Text style={styles.bubbleScore}>Score: {lineScore.score}%</Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.actionArea}>
        {state === 'partner_turn' && (
          <View style={styles.actionMessage}>
            <Volume2 color="#ea3b92" />
            <Text style={styles.actionMessageText}>
              {isPlaying ? "Partner speaking..." : "Preparing..."}
            </Text>
          </View>
        )}

        {state === 'your_turn' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.micBtn} onPress={startListening}>
              <Mic color="#fff" size={32} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => moveToNext()} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}

        {state === 'listening' && (
          <View style={styles.actionMessage}>
            <View style={styles.micActive}>
              <Mic color="#fff" size={32} />
            </View>
            <Text style={styles.actionMessageText}>Listening...</Text>
          </View>
        )}

        {state === 'scored' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => moveToNext()}>
              <Text style={styles.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: { padding: 8 },
  progressText: { fontSize: 16, fontWeight: 'bold', color: '#64748b' },
  content: { padding: 24, flex: 1 },
  contentCentred: { padding: 24, flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#64748b', textAlign: 'center', marginBottom: 32 },
  roleGrid: { flexDirection: 'row', gap: 16, marginBottom: 32 },
  roleCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  roleActive: {
    borderColor: '#ea3b92',
    backgroundColor: '#fdf2f8',
  },
  roleAvatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#ea3b92',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  roleName: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  primaryBtn: {
    flexDirection: 'row', backgroundColor: '#ea3b92', padding: 16, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', gap: 8, width: '100%',
  },
  primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chatArea: { flex: 1 },
  bubble: { maxWidth: '85%', padding: 16, borderRadius: 20, marginBottom: 12 },
  bubblePartner: { alignSelf: 'flex-start', backgroundColor: '#e2e8f0', borderBottomLeftRadius: 4 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#ea3b92', borderBottomRightRadius: 4 },
  bubbleCurrent: { borderWidth: 2, borderColor: '#cbd5e1' },
  bubbleRole: { fontSize: 11, fontWeight: 'bold', opacity: 0.6, marginBottom: 4, textTransform: 'uppercase' },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  bubbleScore: { fontSize: 12, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  actionArea: { padding: 24, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  actionMessage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionMessageText: { fontSize: 16, color: '#64748b', fontWeight: 'bold' },
  actionButtons: { alignItems: 'center' },
  micBtn: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#ea3b92',
    justifyContent: 'center', alignItems: 'center', shadowColor: '#ea3b92',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  micActive: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#ef4444',
    justifyContent: 'center', alignItems: 'center',
  },
  skipBtn: { marginTop: 16, padding: 8 },
  skipText: { color: '#94a3b8', fontSize: 16, fontWeight: 'bold' },
  scoreCircle: {
    width: 120, height: 120, borderRadius: 60, backgroundColor: '#ea3b92',
    justifyContent: 'center', alignItems: 'center', marginVertical: 32,
  },
  scoreNum: { fontSize: 36, fontWeight: 'bold', color: '#fff' },
});
