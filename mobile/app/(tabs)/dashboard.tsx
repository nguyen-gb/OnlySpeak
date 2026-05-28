import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Award, BookOpen, Calendar, Flame, MessageCircle, Target, Trophy, Zap } from 'lucide-react-native';
import { endpoints } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

const PRIMARY = '#ea3b92';

function getMasteryLabel(level: number) {
  if (level >= 95) return { text: 'Mastered', color: '#10b981' };
  if (level >= 75) return { text: 'Advanced', color: '#f59e0b' };
  if (level >= 50) return { text: 'Intermediate', color: '#3b82f6' };
  if (level >= 25) return { text: 'Beginner', color: '#8b5cf6' };
  if (level > 0) return { text: 'Started', color: '#64748b' };
  return { text: 'New', color: '#94a3b8' };
}

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      endpoints.getStats(),
      endpoints.getReviewList().catch(() => ({ data: [] })),
    ])
      .then(([statsRes, reviewRes]) => {
        setStats(statsRes.data);
        setReviews(reviewRes.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.full_name?.split(' ')[0] || 'there';
  const mastery = Number(stats?.overall_mastery || 0);
  const masteryInfo = getMasteryLabel(mastery);
  const statCards = [
    { label: 'Practiced', value: stats?.total_practiced || 0, icon: MessageCircle, color: PRIMARY, bg: '#fdf2f8' },
    { label: 'Completed', value: stats?.total_completed || 0, icon: Target, color: '#10b981', bg: '#dcfce7' },
    { label: 'Avg. Score', value: stats?.average_score ? `${stats.average_score}%` : '-', icon: Award, color: '#f59e0b', bg: '#fef3c7' },
    { label: 'Mastered', value: stats?.total_mastered || 0, icon: Trophy, color: '#3b82f6', bg: '#dbeafe' },
  ];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.kicker}>OnlySpeak</Text>
          <Text style={styles.title}>Welcome back, {firstName}</Text>
          <Text style={styles.desc}>
            {reviews.length > 0
              ? `You have ${reviews.length} reviews due today. Keep your streak alive.`
              : 'Ready to practice your English speaking skills?'}
          </Text>
        </View>
        <TouchableOpacity style={styles.heroButton} onPress={() => router.push('/(tabs)/topics')}>
          <BookOpen size={18} color="#fff" />
          <Text style={styles.heroButtonText}>Browse</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusPill}>
          <Flame size={16} color="#ef4444" />
          <Text style={styles.statusText}>{user?.streak_count || 0} Day Streak</Text>
        </View>
        <View style={styles.statusPill}>
          <Zap size={16} color="#f59e0b" />
          <Text style={styles.statusText}>Level {Math.floor((user?.total_xp || 0) / 100) + 1}</Text>
        </View>
      </View>

      {reviews.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Calendar size={20} color={PRIMARY} />
            <Text style={styles.sectionTitle}>Daily Review</Text>
            <View style={styles.countBadge}><Text style={styles.countBadgeText}>{reviews.length}</Text></View>
          </View>
          {reviews.slice(0, 3).map((item) => (
            <TouchableOpacity
              key={item.progress.id}
              style={styles.reviewCard}
              onPress={() => router.push(`/practice/${item.progress.conversation_id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.reviewTitle}>{item.conversation_title}</Text>
                <Text style={styles.reviewMeta}>Mode {item.progress.current_mode} · {item.overdue_days > 0 ? `${item.overdue_days}d overdue` : 'Due today'}</Text>
              </View>
              <Text style={styles.reviewAction}>Review</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.statsGrid}>
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <View key={item.label} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: item.bg }]}>
                <Icon size={21} color={item.color} />
              </View>
              <Text style={styles.statValue}>{item.value}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          );
        })}
      </View>

      {(stats?.total_practiced || 0) > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Flame size={20} color={masteryInfo.color} />
            <Text style={styles.sectionTitle}>Overall Mastery</Text>
            <View style={[styles.masteryBadge, { backgroundColor: masteryInfo.color }]}>
              <Text style={styles.masteryBadgeText}>{masteryInfo.text}</Text>
            </View>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${mastery}%`, backgroundColor: masteryInfo.color }]} />
          </View>
          <Text style={styles.masteryPercent}>{mastery.toFixed(1)}%</Text>
          {(stats?.due_for_review || 0) > 0 && (
            <Text style={styles.hint}>{stats.due_for_review} conversations are due for review.</Text>
          )}
        </View>
      )}

      {(stats?.recent_progress || []).length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent History</Text>
          <FlatList
            data={(stats.recent_progress || []).slice(0, 5)}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const info = getMasteryLabel(item.mastery_level || 0);
              return (
                <TouchableOpacity
                  style={styles.recentItem}
                  onPress={() => router.push(`/practice/${item.conversation_id}`)}
                  activeOpacity={0.8}
                >
                  <View>
                    <Text style={styles.recentTitle} numberOfLines={2}>
                      {item.conversation_title || `Conversation ${String(item.conversation_id).slice(0, 8)}`}
                    </Text>
                    <Text style={styles.recentRole}>Role {item.role_played} · Mode {item.current_mode || 1}</Text>
                    <Text style={styles.recentDate}>{new Date(item.last_practiced_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.recentMastery, { color: info.color }]}>{info.text} {(item.mastery_level || 0).toFixed(0)}%</Text>
                    <Text style={styles.recentStatus}>{item.is_completed ? 'Completed' : 'Partial'}</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No practice sessions yet</Text>
          <Text style={styles.emptyDesc}>Start your first conversation to track progress.</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/(tabs)/topics')}>
            <Text style={styles.emptyButtonText}>Explore Topics</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  hero: { backgroundColor: '#fff', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  heroText: { flex: 1 },
  kicker: { color: PRIMARY, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  desc: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  heroButton: { backgroundColor: PRIMARY, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, alignItems: 'center', gap: 4 },
  heroButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  statusRow: { flexDirection: 'row', gap: 10 },
  statusPill: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  statusText: { color: '#334155', fontWeight: '700' },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', flex: 1 },
  countBadge: { backgroundColor: '#fdf2f8', borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { color: PRIMARY, fontWeight: '800' },
  reviewCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  reviewTitle: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
  reviewMeta: { color: '#64748b', marginTop: 4, fontSize: 13 },
  reviewAction: { color: PRIMARY, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { width: '48%', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' },
  statIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statValue: { color: '#0f172a', fontSize: 24, fontWeight: '900' },
  statLabel: { color: '#64748b', fontWeight: '600', marginTop: 2 },
  masteryBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  masteryBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  progressTrack: { height: 10, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  masteryPercent: { color: '#0f172a', fontWeight: '900', marginTop: 8, textAlign: 'right' },
  hint: { color: '#64748b', marginTop: 8, fontSize: 13 },
  recentItem: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  recentTitle: { color: '#0f172a', fontWeight: '900', maxWidth: 190 },
  recentRole: { color: '#64748b', fontWeight: '800', marginTop: 3 },
  recentDate: { color: '#64748b', marginTop: 4, fontSize: 13 },
  recentMastery: { fontWeight: '800', fontSize: 13 },
  recentStatus: { color: '#64748b', marginTop: 4, fontSize: 12 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
  emptyTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  emptyDesc: { color: '#64748b', marginTop: 8, textAlign: 'center' },
  emptyButton: { backgroundColor: PRIMARY, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, marginTop: 16 },
  emptyButtonText: { color: '#fff', fontWeight: '800' },
});
