import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import api from '../../../lib/api';
import { MessageSquare, ChevronRight } from 'lucide-react-native';

export default function TopicsScreen() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/topics')
      .then(res => setTopics(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const renderTopic = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => router.push(`/(tabs)/topics/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.iconText}>{item.icon}</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.level}</Text>
          </View>
          <View style={styles.convCount}>
            <MessageSquare size={14} color="#64748b" />
            <Text style={styles.convCountText}>{item.conversation_count || 0}</Text>
          </View>
        </View>
      </View>
      <ChevronRight size={24} color="#cbd5e1" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ea3b92" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={topics}
        keyExtractor={(item: any) => item.id}
        renderItem={renderTopic}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  listContainer: {
    padding: 16,
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconText: {
    fontSize: 28,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    color: '#4338ca',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  convCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  convCountText: {
    fontSize: 12,
    color: '#64748b',
  },
});
