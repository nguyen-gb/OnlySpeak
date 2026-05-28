import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { endpoints } from '../../../lib/api';
import { Users, Play, ArrowLeft, Trophy, Target, Flame, Zap } from 'lucide-react-native';

function getMasteryLabel(level: number) {
  if (level >= 95) return { text: 'Mastered', color: '#10b981' };
  if (level >= 75) return { text: 'Advanced', color: '#f59e0b' };
  if (level >= 50) return { text: 'Intermediate', color: '#3b82f6' };
  if (level >= 25) return { text: 'Beginner', color: '#8b5cf6' };
  if (level > 0) return { text: 'Started', color: '#64748b' };
  return { text: 'New', color: '#94a3b8' };
}

export default function TopicDetailScreen() {
  const { id } = useLocalSearchParams();
  const [data, setData] = useState<any>(null);
  const [masteryMap, setMasteryMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      Promise.all([
        endpoints.getTopic(id),
        endpoints.getMasteryMap().catch(() => ({ data: {} })),
      ])
        .then(([topicRes, masteryRes]) => {
          setData(topicRes.data);
          setMasteryMap(masteryRes.data || {});
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ea3b92" />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <Text>Topic not found</Text>
      </View>
    );
  }

  const { topic, conversations } = data;

  const renderConversation = ({ item }: { item: any }) => {
    const mastery = masteryMap[item.id] || {};
    const masteryLevel = mastery.mastery_level || 0;
    const masteryInfo = getMasteryLabel(masteryLevel);
    const practiceCount = mastery.practice_count || 0;
    const currentMode = mastery.current_mode || 1;
    const avgRT = mastery.avg_response_time || 0;

    return (
      <View style={styles.convCard}>
        <View style={styles.convHeader}>
          <Text style={styles.convTitle}>{item.title}</Text>
          {masteryLevel >= 95 ? (
            <View style={styles.masteredBadge}>
              <Trophy size={13} color="#047857" />
              <Text style={styles.masteredText}>Mastered</Text>
            </View>
          ) : (
            <Text style={styles.modeBadge}>Mode {currentMode}/5</Text>
          )}
        </View>
        {item.situation && (
          <Text style={styles.convSituation} numberOfLines={2}>{item.situation}</Text>
        )}
        <View style={styles.convMeta}>
          <View style={styles.rolesMeta}>
            <Users size={14} color="#64748b" />
            <Text style={styles.rolesText} numberOfLines={1}>
              {item.role_a_name} & {item.role_b_name}
            </Text>
          </View>
          <Text style={styles.convLines}>{item.line_count} lines</Text>
          {avgRT > 0 && (
            <View style={styles.rtMeta}>
              <Zap size={12} color="#f59e0b" />
              <Text style={styles.rtText}>{avgRT}s</Text>
            </View>
          )}
        </View>
        <View style={styles.masterySection}>
          <View style={styles.masteryHeader}>
            <Text style={[styles.masteryLabel, { color: masteryInfo.color }]}>{masteryInfo.text}</Text>
            <Text style={[styles.masteryPercent, { color: masteryInfo.color }]}>{masteryLevel.toFixed(1)}%</Text>
          </View>
          <View style={styles.masteryBar}>
            <View style={[styles.masteryFill, { width: `${masteryLevel}%`, backgroundColor: masteryInfo.color }]} />
          </View>
          {practiceCount > 0 && (
            <View style={styles.masteryMeta}>
              <View style={styles.masteryChip}><Target size={12} color="#64748b" /><Text style={styles.masteryChipText}>{practiceCount}x practiced</Text></View>
              {(mastery.streak_perfect || 0) > 0 && <View style={styles.masteryChip}><Flame size={12} color="#ef4444" /><Text style={styles.masteryChipText}>{mastery.streak_perfect} streak</Text></View>}
            </View>
          )}
        </View>
        <TouchableOpacity 
          style={styles.practiceBtn}
          onPress={() => router.push(`/practice/${item.id}`)}
        >
          <Play size={16} color="#fff" />
          <Text style={styles.practiceBtnText}>{practiceCount > 0 ? 'Practice Again' : 'Practice'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.headerIcon}>
          <Text style={{ fontSize: 40 }}>{topic.icon}</Text>
        </View>
        <Text style={styles.headerTitle}>{topic.title}</Text>
        <Text style={styles.headerDesc}>{topic.description}</Text>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{topic.level}</Text>
        </View>
      </View>

      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>
          Conversations ({conversations.length})
        </Text>
        <FlatList
          data={conversations}
          keyExtractor={(item: any) => item.id}
          renderItem={renderConversation}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 24,
    paddingTop: 60, // approximate safe area
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
    position: 'relative',
  },
  backBtn: {
    position: 'absolute',
    left: 20,
    top: 60,
    zIndex: 10,
    padding: 8,
  },
  headerIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  headerDesc: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
  listSection: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  listContainer: {
    padding: 16,
    paddingTop: 0,
    gap: 16,
  },
  convCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  convHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  convTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0f172a',
    flex: 1,
  },
  modeBadge: {
    color: '#ea3b92',
    backgroundColor: '#fdf2f8',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 10,
  },
  masteredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 10,
  },
  masteredText: { color: '#047857', fontSize: 12, fontWeight: '800' },
  convLines: {
    fontSize: 13,
    color: '#94a3b8',
    marginLeft: 12,
  },
  convSituation: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  convMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  rolesMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rolesText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    maxWidth: 180,
  },
  rtMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fffbeb', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  rtText: { color: '#92400e', fontSize: 12, fontWeight: '700' },
  levelBadge: { backgroundColor: '#e0e7ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginTop: 12 },
  levelBadgeText: { color: '#4338ca', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  masterySection: { marginBottom: 16 },
  masteryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  masteryLabel: { fontSize: 13, fontWeight: '800' },
  masteryPercent: { fontSize: 13, fontWeight: '900' },
  masteryBar: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' },
  masteryFill: { height: '100%', borderRadius: 999 },
  masteryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  masteryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  masteryChipText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
  practiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ea3b92',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  practiceBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
