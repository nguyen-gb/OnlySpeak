import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';
import { endpoints } from '../../lib/api';
import { Award, Flame, LogOut, Trophy, User as UserIcon, Zap } from 'lucide-react-native';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    endpoints.getStats()
      .then((res) => setStats(res.data))
      .catch(() => setStats(null))
      .finally(() => setLoadingStats(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <UserIcon size={48} color="#ea3b92" />
          )}
        </View>
        <Text style={styles.name}>{user?.full_name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.statusRow}>
          <View style={styles.statusPill}><Flame size={15} color="#ef4444" /><Text style={styles.statusText}>{user?.streak_count || 0} Day Streak</Text></View>
          <View style={styles.statusPill}><Zap size={15} color="#f59e0b" /><Text style={styles.statusText}>{user?.total_xp || 0} XP</Text></View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Learning Stats</Text>
          {loadingStats ? (
            <ActivityIndicator color="#ea3b92" />
          ) : (
            <View style={styles.statsGrid}>
              <View style={styles.statItem}><Award size={20} color="#ea3b92" /><Text style={styles.statValue}>{stats?.average_score ? `${stats.average_score}%` : '-'}</Text><Text style={styles.statLabel}>Avg. Score</Text></View>
              <View style={styles.statItem}><Trophy size={20} color="#10b981" /><Text style={styles.statValue}>{stats?.total_mastered || 0}</Text><Text style={styles.statLabel}>Mastered</Text></View>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#fdf2f8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ea3b92',
  },
  avatarImage: { width: 92, height: 92, borderRadius: 46 },
  name: { fontSize: 24, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  email: { fontSize: 16, color: '#64748b' },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f8fafc', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  statusText: { color: '#334155', fontSize: 12, fontWeight: '800' },
  section: { padding: 24, gap: 16 },
  statsCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '900', marginBottom: 14 },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statItem: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, alignItems: 'center', gap: 5 },
  statValue: { color: '#0f172a', fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    paddingVertical: 16,
    borderRadius: 16,
  },
  logoutText: { color: '#ef4444', fontSize: 16, fontWeight: 'bold' },
});
