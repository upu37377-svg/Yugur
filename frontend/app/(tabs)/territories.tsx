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

interface Run {
  id: string;
  distance: number;
  duration: number;
  start_time: string;
  end_time: string;
  created_at: string;
}

export default function TerritoriesScreen() {
  const { user, token, refreshUser } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    if (!token) return;
    
    try {
      const response = await axios.get(`${API_URL}/api/runs/me?token=${token}`);
      setRuns(response.data);
      await refreshUser();
    } catch (error) {
      console.error('Error loading runs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadRuns();
  };

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateTerritorySize = (): string => {
    const totalKm = user?.total_distance || 0;
    // Approximate territory as a square where side = distance run
    // This is a simplification for display purposes
    const areaKm2 = totalKm * 0.1; // Rough estimate
    if (areaKm2 < 1) {
      return `${(areaKm2 * 1000000).toFixed(0)} m²`;
    }
    return `${areaKm2.toFixed(2)} km²`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4DA6FF" />
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
        <Text style={styles.headerTitle}>My Territories</Text>

        <View style={styles.statsCard}>
          <View style={styles.userInfo}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={24} color="#5A7A9A" />
              </View>
            )}
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{user?.name}</Text>
              <Text style={styles.userPhone}>{user?.phone}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Ionicons name="walk" size={28} color="#4DA6FF" />
              <Text style={styles.statValue}>{user?.total_distance.toFixed(2)}</Text>
              <Text style={styles.statLabel}>Total km</Text>
            </View>
            <View style={styles.statBox}>
              <Ionicons name="flag" size={28} color="#4DA6FF" />
              <Text style={styles.statValue}>{calculateTerritorySize()}</Text>
              <Text style={styles.statLabel}>Territory</Text>
            </View>
            <View style={styles.statBox}>
              <Ionicons name="trophy" size={28} color="#4DA6FF" />
              <Text style={styles.statValue}>{runs.length}</Text>
              <Text style={styles.statLabel}>Runs</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Running History</Text>

        {runs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="fitness" size={64} color="#2A4A6A" />
            <Text style={styles.emptyText}>No runs recorded yet</Text>
            <Text style={styles.emptySubtext}>Start your first run to claim territory!</Text>
          </View>
        ) : (
          runs.map((run, index) => (
            <View key={run.id} style={styles.runCard}>
              <View style={styles.runHeader}>
                <View style={styles.runNumber}>
                  <Text style={styles.runNumberText}>#{runs.length - index}</Text>
                </View>
                <Text style={styles.runDate}>{formatDate(run.start_time)}</Text>
              </View>
              <View style={styles.runStats}>
                <View style={styles.runStat}>
                  <Ionicons name="walk" size={20} color="#4DA6FF" />
                  <Text style={styles.runStatValue}>{run.distance.toFixed(2)} km</Text>
                </View>
                <View style={styles.runStat}>
                  <Ionicons name="time" size={20} color="#4DA6FF" />
                  <Text style={styles.runStatValue}>{formatDuration(run.duration)}</Text>
                </View>
                <View style={styles.runStat}>
                  <Ionicons name="speedometer" size={20} color="#4DA6FF" />
                  <Text style={styles.runStatValue}>
                    {run.distance > 0 ? `${(run.duration / 60 / run.distance).toFixed(1)} min/km` : '--'}
                  </Text>
                </View>
              </View>
            </View>
          ))
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
  scrollContent: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  statsCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2A4A6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDetails: {
    marginLeft: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  userPhone: {
    fontSize: 14,
    color: '#8BA4C4',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
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
  emptySubtext: {
    fontSize: 14,
    color: '#5A7A9A',
    marginTop: 8,
  },
  runCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  runHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  runNumber: {
    backgroundColor: '#4DA6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  runNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  runDate: {
    color: '#8BA4C4',
    fontSize: 12,
    marginLeft: 12,
  },
  runStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  runStat: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  runStatValue: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 6,
  },
});
