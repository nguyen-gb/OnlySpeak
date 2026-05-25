import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import api from '../../lib/api';
import { History as HistoryIcon } from 'lucide-react-native';

export default function HistoryScreen() {
  const [progress, setProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/progress')
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
      <FlatList
        data={progress}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.date}>
                {new Date(item.last_practiced_at).toLocaleDateString()}
              </Text>
              <View style={item.is_completed ? styles.badgeSuccess : styles.badgeWarning}>
                <Text style={item.is_completed ? styles.badgeTextSuccess : styles.badgeTextWarning}>
                  {item.is_completed ? 'Completed' : 'In Progress'}
                </Text>
              </View>
            </View>
            <View style={styles.metrics}>
              <Text style={styles.role}>Role {item.role_played}</Text>
              <Text style={styles.score}>
                Score: {item.pronunciation_score ? `${item.pronunciation_score}%` : 'N/A'}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  date: { fontSize: 13, color: '#64748b' },
  badgeSuccess: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeTextSuccess: { color: '#166534', fontSize: 12, fontWeight: 'bold' },
  badgeWarning: { backgroundColor: '#fef9c3', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeTextWarning: { color: '#854d0e', fontSize: 12, fontWeight: 'bold' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  role: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  score: { fontSize: 15, fontWeight: '700', color: '#ea3b92' },
});
