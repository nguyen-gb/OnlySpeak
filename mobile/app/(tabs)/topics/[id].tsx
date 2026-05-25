import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../../lib/api';
import { Users, Play, ArrowLeft } from 'lucide-react-native';

export default function TopicDetailScreen() {
  const { id } = useLocalSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      api.get(`/api/topics/${id}`)
        .then(res => setData(res.data))
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

  const renderConversation = ({ item }: { item: any }) => (
    <View style={styles.convCard}>
      <View style={styles.convHeader}>
        <Text style={styles.convTitle}>{item.title}</Text>
        <Text style={styles.convLines}>{item.line_count} lines</Text>
      </View>
      {item.situation && (
        <Text style={styles.convSituation} numberOfLines={2}>{item.situation}</Text>
      )}
      <View style={styles.convMeta}>
        <View style={styles.rolesMeta}>
          <Users size={14} color="#64748b" />
          <Text style={styles.rolesText}>
            {item.role_a_name} & {item.role_b_name}
          </Text>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.practiceBtn}
        onPress={() => router.push(`/practice/${item.id}`)}
      >
        <Play size={16} color="#fff" />
        <Text style={styles.practiceBtnText}>Practice</Text>
      </TouchableOpacity>
    </View>
  );

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
  },
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
