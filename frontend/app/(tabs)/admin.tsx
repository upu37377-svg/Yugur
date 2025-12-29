import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface LeaderboardUser {
  rank: number;
  id: string;
  name: string;
  phone: string;
  avatar: string | null;
  total_distance: number;
  is_admin: boolean;
  created_at: string;
}

export default function AdminScreen() {
  const { user, token } = useAuth();
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    if (!token) return;
    
    try {
      setError(null);
      const response = await axios.get(`${API_URL}/api/admin/users?token=${token}`);
      setUsers(response.data);
    } catch (error: any) {
      if (error.response?.status === 403) {
        setError('Admin access required');
      } else {
        setError('Failed to load users');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadUsers();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.accessDenied}>
          <Ionicons name="shield" size={64} color="#FF6B6B" />
          <Text style={styles.accessDeniedTitle}>Admin Access Required</Text>
          <Text style={styles.accessDeniedText}>
            This section is only available for administrators.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4DA6FF" />
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.accessDenied}>
          <Ionicons name="alert-circle" size={64} color="#FF6B6B" />
          <Text style={styles.accessDeniedTitle}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4DA6FF"
          />
        }
      >
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={32} color="#4DA6FF" />
          <Text style={styles.headerTitle}>Admin Panel</Text>
        </View>

        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{users.length}</Text>
            <Text style={styles.statLabel}>Total Users</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {users.reduce((sum, u) => sum + u.total_distance, 0).toFixed(1)}
            </Text>
            <Text style={styles.statLabel}>Total km</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>All Users (Ranked by Distance)</Text>

        {users.map((u) => (
          <View key={u.id} style={styles.userCard}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>#{u.rank}</Text>
            </View>
            
            <View style={styles.userMain}>
              {u.avatar ? (
                <Image source={{ uri: u.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={20} color="#5A7A9A" />
                </View>
              )}
              
              <View style={styles.userInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.userName}>{u.name}</Text>
                  {u.is_admin && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.userPhone}>{u.phone}</Text>
                <Text style={styles.userJoined}>Joined {formatDate(u.created_at)}</Text>
              </View>
            </View>

            <View style={styles.distanceBox}>
              <Text style={styles.distanceValue}>{u.total_distance.toFixed(2)}</Text>
              <Text style={styles.distanceLabel}>km</Text>
            </View>
          </View>
        ))}

        {users.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="people" size={64} color="#2A4A6A" />
            <Text style={styles.emptyText}>No users registered yet</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2744',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  accessDeniedText: {
    fontSize: 16,
    color: '#8BA4C4',
    marginTop: 12,
    textAlign: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 12,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2A4A6A',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4DA6FF',
  },
  statLabel: {
    fontSize: 14,
    color: '#8BA4C4',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  userCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankBadge: {
    backgroundColor: '#4DA6FF',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  userMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2A4A6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  adminBadge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  adminBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  userPhone: {
    fontSize: 13,
    color: '#8BA4C4',
    marginTop: 2,
  },
  userJoined: {
    fontSize: 11,
    color: '#5A7A9A',
    marginTop: 2,
  },
  distanceBox: {
    alignItems: 'center',
    backgroundColor: '#0F2744',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  distanceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4DA6FF',
  },
  distanceLabel: {
    fontSize: 10,
    color: '#8BA4C4',
  },
  emptyCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#8BA4C4',
    marginTop: 16,
  },
});
