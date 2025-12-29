import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

// Conditionally import MapView only for native platforms
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

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
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<MapView>(null);

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
    }
  };

  const centerOnUser = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }
  };

  const getColorForUser = (index: number) => {
    return ROUTE_COLORS[index % ROUTE_COLORS.length];
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4DA6FF" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initialRegion = userLocation
    ? {
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : {
        latitude: 41.2995,
        longitude: 69.2401,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        customMapStyle={mapStyle}
      >
        {territories.map((territory, userIndex) =>
          territory.runs.map((run) => (
            <React.Fragment key={run.id}>
              {run.route.length > 1 && (
                <Polyline
                  coordinates={run.route.map((point) => ({
                    latitude: point.lat,
                    longitude: point.lng,
                  }))}
                  strokeColor={getColorForUser(userIndex)}
                  strokeWidth={4}
                />
              )}
              {run.route.length > 0 && (
                <Marker
                  coordinate={{
                    latitude: run.route[0].lat,
                    longitude: run.route[0].lng,
                  }}
                  title={territory.user_name}
                  description={`${territory.user_phone} - ${territory.total_distance.toFixed(2)} km`}
                >
                  <View style={[styles.marker, { backgroundColor: getColorForUser(userIndex) }]}>
                    <Ionicons name="person" size={16} color="#fff" />
                  </View>
                </Marker>
              )}
            </React.Fragment>
          ))
        )}
      </MapView>

      <SafeAreaView style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Territories Map</Text>
        </View>

        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Active Runners</Text>
          {territories.filter(t => t.runs.length > 0).slice(0, 5).map((territory, index) => (
            <View key={territory.user_id} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: getColorForUser(index) }]} />
              <Text style={styles.legendName} numberOfLines={1}>{territory.user_name}</Text>
              <Text style={styles.legendDistance}>{territory.total_distance.toFixed(1)} km</Text>
            </View>
          ))}
          {territories.filter(t => t.runs.length > 0).length === 0 && (
            <Text style={styles.emptyText}>No running data yet</Text>
          )}
        </View>
      </SafeAreaView>

      <TouchableOpacity style={styles.locationButton} onPress={centerOnUser}>
        <Ionicons name="locate" size={24} color="#4DA6FF" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.refreshButton} onPress={loadData}>
        <Ionicons name="refresh" size={24} color="#4DA6FF" />
      </TouchableOpacity>
    </View>
  );
}

const mapStyle = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#1d2c4d' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8ec3b9' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#1a3646' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#304a7d' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#255763' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0e1626' }],
  },
];

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
  map: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'box-none',
  },
  header: {
    backgroundColor: 'rgba(15, 39, 68, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: Platform.OS === 'android' ? 40 : 0,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  legendCard: {
    backgroundColor: 'rgba(26, 58, 92, 0.95)',
    margin: 16,
    borderRadius: 12,
    padding: 16,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8BA4C4',
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  legendName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  legendDistance: {
    color: '#8BA4C4',
    fontSize: 12,
  },
  emptyText: {
    color: '#5A7A9A',
    fontSize: 14,
    fontStyle: 'italic',
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  locationButton: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    backgroundColor: '#1A3A5C',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  refreshButton: {
    position: 'absolute',
    bottom: 160,
    right: 16,
    backgroundColor: '#1A3A5C',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
