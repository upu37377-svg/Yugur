import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  ScrollView,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Territory {
  user_id: string;
  user_name: string;
  user_phone: string;
  user_avatar: string | null;
  total_distance: number;
  runs: Array<{
    id: string;
    route: Array<{ lat: number; lng: number; timestamp: number }>;
    distance: number;
  }>;
}

const ROUTE_COLORS = [
  '#4DA6FF', '#FF6B6B', '#4CAF50', '#FF9500', '#9C27B0',
  '#00BCD4', '#E91E63', '#FFEB3B', '#795548', '#607D8B',
];

export default function MapScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Get user location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }

      // Load territories
      const response = await axios.get(`${API_URL}/api/territories`);
      setTerritories(response.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getColorForUser = (index: number) => {
    return ROUTE_COLORS[index % ROUTE_COLORS.length];
  };

  const totalRuns = territories.reduce((sum, t) => sum + t.runs.length, 0);
  const totalDistance = territories.reduce((sum, t) => sum + t.total_distance, 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4DA6FF" />
          <Text style={styles.loadingText}>Loading territories...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Web/List View - Shows territories as a list since react-native-maps doesn't work well on web
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
        <Text style={styles.headerTitle}>Territories Map</Text>

        {Platform.OS === 'web' && (
          <View style={styles.webNotice}>
            <Ionicons name="information-circle" size={20} color="#4DA6FF" />
            <Text style={styles.webNoticeText}>
              Full map view available on mobile app. Showing territory list below.
            </Text>
          </View>
        )}

        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Ionicons name="people" size={28} color="#4DA6FF" />
            <Text style={styles.statValue}>{territories.length}</Text>
            <Text style={styles.statLabel}>Users</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="fitness" size={28} color="#4DA6FF" />
            <Text style={styles.statValue}>{totalRuns}</Text>
            <Text style={styles.statLabel}>Runs</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="map" size={28} color="#4DA6FF" />
            <Text style={styles.statValue}>{totalDistance.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Total km</Text>
          </View>
        </View>

        {userLocation && (
          <View style={styles.locationCard}>
            <Ionicons name="locate" size={20} color="#4DA6FF" />
            <Text style={styles.locationText}>
              Your location: {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Active Runners</Text>

        {territories.filter(t => t.runs.length > 0).length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="walk" size={64} color="#2A4A6A" />
            <Text style={styles.emptyText}>No running routes yet</Text>
            <Text style={styles.emptySubtext}>Start running to claim your territory!</Text>
          </View>
        ) : (
          territories.filter(t => t.runs.length > 0).map((territory, index) => (
            <View key={territory.user_id} style={styles.territoryCard}>
              <View style={styles.territoryHeader}>
                <View style={[styles.colorDot, { backgroundColor: getColorForUser(index) }]} />
                {territory.user_avatar ? (
                  <Image source={{ uri: territory.user_avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={16} color="#5A7A9A" />
                  </View>
                )}
                <View style={styles.territoryInfo}>
                  <Text style={styles.territoryName}>{territory.user_name}</Text>
                  <Text style={styles.territoryPhone}>{territory.user_phone}</Text>
                </View>
                <View style={styles.territoryStats}>
                  <Text style={styles.distanceValue}>{territory.total_distance.toFixed(2)} km</Text>
                  <Text style={styles.runsCount}>{territory.runs.length} runs</Text>
                </View>
              </View>
              
              {territory.runs.slice(0, 3).map((run, runIndex) => (
                <View key={run.id} style={styles.runPreview}>
                  <View style={styles.runDot} />
                  <Text style={styles.runDistance}>{run.distance.toFixed(2)} km</Text>
                  {run.route.length > 0 && (
                    <Text style={styles.runLocation}>
                      Start: {run.route[0].lat.toFixed(4)}, {run.route[0].lng.toFixed(4)}
                    </Text>
                  )}
                </View>
              ))}
              {territory.runs.length > 3 && (
                <Text style={styles.moreRuns}>+{territory.runs.length - 3} more runs</Text>
              )}
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>All Users</Text>

        {territories.filter(t => t.runs.length === 0).map((territory, index) => (
          <View key={territory.user_id} style={styles.userCard}>
            {territory.user_avatar ? (
              <Image source={{ uri: territory.user_avatar }} style={styles.smallAvatar} />
            ) : (
              <View style={styles.smallAvatarPlaceholder}>
                <Ionicons name="person" size={14} color="#5A7A9A" />
              </View>
            )}
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{territory.user_name}</Text>
              <Text style={styles.userPhone}>{territory.user_phone}</Text>
            </View>
            <View style={styles.noRunsBadge}>
              <Text style={styles.noRunsText}>No runs yet</Text>
            </View>
          </View>
        ))}
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
  loadingText: {
    color: '#8BA4C4',
    marginTop: 16,
    fontSize: 16,
  },
  scrollContent: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  webNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(77, 166, 255, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  webNoticeText: {
    color: '#8BA4C4',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 4,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A5C',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  locationText: {
    color: '#B8CDE8',
    fontSize: 13,
    marginLeft: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    marginBottom: 20,
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
  territoryCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  territoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A4A6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  territoryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  territoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  territoryPhone: {
    fontSize: 13,
    color: '#8BA4C4',
    marginTop: 2,
  },
  territoryStats: {
    alignItems: 'flex-end',
  },
  distanceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4DA6FF',
  },
  runsCount: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 2,
  },
  runPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingLeft: 22,
  },
  runDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4DA6FF',
    marginRight: 10,
  },
  runDistance: {
    color: '#B8CDE8',
    fontSize: 13,
    fontWeight: '500',
  },
  runLocation: {
    color: '#5A7A9A',
    fontSize: 11,
    marginLeft: 12,
  },
  moreRuns: {
    color: '#5A7A9A',
    fontSize: 12,
    marginTop: 8,
    paddingLeft: 22,
    fontStyle: 'italic',
  },
  userCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  smallAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  smallAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A4A6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  userPhone: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 2,
  },
  noRunsBadge: {
    backgroundColor: '#2A4A6A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  noRunsText: {
    color: '#5A7A9A',
    fontSize: 11,
  },
});
