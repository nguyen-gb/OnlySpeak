import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { endpoints } from '../../lib/api';
import { CheckCircle, Clock, History as HistoryIcon, MessageSquare } from 'lucide-react-native';

export default function HistoryScreen() {
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    endpoints.getProgress()
      .then(res => setProgress(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ea3b92" />
      </View>
    );
  }

  if (progress.length === 0) {
    return (
      <View style={styles.empty}>
        <HistoryIcon size={64} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>No history yet</Text>
        <Text style={styles.emptyDesc}>Practice a conversation to see it here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Practice History</Text>
        <Text style={styles.pageDesc}>Your recent practice sessions</Text>
      </View>
      <FlatList
        data={progress}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/practice/${item.conversation_id}`)} activeOpacity={0.8}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.conversationTitle} numberOfLines={2}>
                  {item.conversation_title || `Conversation ${String(item.conversation_id).slice(0, 8)}`}
                </Text>
                <Text style={styles.date}>
                {new Date(item.last_practiced_at).toLocaleDateString()}
                </Text>
                <Text style={styles.modeText}>Role {item.role_played} · Mode {item.current_mode || item.practice_mode || 1}</Text>
              </View>
              <View style={item.is_completed ? styles.badgeSuccess : styles.badgeWarning}>
                <Text style={item.is_completed ? styles.badgeTextSuccess : styles.badgeTextWarning}>
                  {item.is_completed ? 'Completed' : 'In Progress'}
                </Text>
              </View>
            </View>
            <View style={styles.metrics}>
              <View style={styles.metric}><MessageSquare size={16} color="#64748b" /><Text style={styles.metricText}>{item.completed_lines}/{item.total_lines} lines</Text></View>
              <View style={styles.metric}><CheckCircle size={16} color="#10b981" /><Text style={styles.score}>{item.pronunciation_score ? `${item.pronunciation_score}%` : '-'}</Text></View>
              <View style={styles.metric}><Clock size={16} color="#f59e0b" /><Text style={styles.metricText}>{item.practice_count || 0}x</Text></View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pageHeader: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4 },
  pageTitle: { color: '#0f172a', fontSize: 26, fontWeight: '900' },
  pageDesc: { color: '#64748b', fontSize: 15, marginTop: 4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginTop: 16 },
  emptyDesc: { fontSize: 15, color: '#64748b', textAlign: 'center', marginTop: 8 },
  list: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 },
  cardTitleBlock: { flex: 1 },
  conversationTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  date: { fontSize: 13, color: '#64748b' },
  modeText: { color: '#0f172a', fontSize: 15, fontWeight: '800', marginTop: 4 },
  badgeSuccess: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeTextSuccess: { color: '#166534', fontSize: 12, fontWeight: 'bold' },
  badgeWarning: { backgroundColor: '#fef9c3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeTextWarning: { color: '#854d0e', fontSize: 12, fontWeight: 'bold' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  metricText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  score: { fontSize: 15, fontWeight: '700', color: '#ea3b92' },
});
