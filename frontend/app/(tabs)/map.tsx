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
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// Conditionally import MapView only for native platforms
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default;
    Marker = Maps.Marker;
    Polyline = Maps.Polyline;
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
  } catch (e) {
    console.log('react-native-maps not available');
  }
}

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

// Web Map Component using OpenStreetMap Static Tiles
function WebMapView({ userLocation, territories }: { userLocation: { lat: number; lng: number } | null; territories: Territory[] }) {
  const lat = userLocation?.lat || 41.2995;
  const lng = userLocation?.lng || 69.2401;
  
  // OpenStreetMap static tile URL (free, no API key needed)
  const zoom = 13;
  const osmTileUrl = `https://tile.openstreetmap.org/${zoom}/${Math.floor((lng + 180) / 360 * Math.pow(2, zoom))}/${Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom))}.png`;
  
  // Google Maps link for opening in browser
  const googleMapsLink = `https://www.google.com/maps/@${lat},${lng},14z`;

  return (
    <View style={styles.webMapContainer}>
      <View style={styles.staticMapContainer}>
        {/* Background color as map placeholder */}
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map" size={80} color="#4DA6FF" />
          <Text style={styles.mapPlaceholderTitle}>Toshkent, O'zbekiston</Text>
          <Text style={styles.mapPlaceholderCoords}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
          
          <TouchableOpacity 
            style={styles.openMapButton}
            onPress={() => {
              if (Platform.OS === 'web') {
                window.open(googleMapsLink, '_blank');
              }
            }}
          >
            <Ionicons name="open-outline" size={20} color="#fff" />
            <Text style={styles.openMapButtonText}>Google Xaritada ochish</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Overlay with user info */}
      <View style={styles.webMapOverlay}>
        <Text style={styles.webMapOverlayTitle}>Xaritadagi foydalanuvchilar</Text>
        {territories.filter(t => t.runs.length > 0).slice(0, 3).map((t, i) => (
          <View key={t.user_id} style={styles.webMapUser}>
            <View style={[styles.colorDot, { backgroundColor: ROUTE_COLORS[i % ROUTE_COLORS.length] }]} />
            <Text style={styles.webMapUserName}>{t.user_name}</Text>
            <Text style={styles.webMapUserDistance}>{t.total_distance.toFixed(1)} km</Text>
          </View>
        ))}
        {territories.filter(t => t.runs.length > 0).length === 0 && (
          <Text style={styles.webMapNoData}>Hali yugurish yo'llari yo'q</Text>
        )}
      </View>
    </View>
  );
}

// Native Map Component
function NativeMapView({ userLocation, territories, mapRef }: { 
  userLocation: { lat: number; lng: number } | null; 
  territories: Territory[];
  mapRef: React.RefObject<any>;
}) {
  if (!MapView) {
    return (
      <View style={styles.mapFallback}>
        <Ionicons name="map" size={64} color="#4DA6FF" />
        <Text style={styles.mapFallbackText}>Map not available</Text>
      </View>
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
            {run.route.length > 1 && Polyline && (
              <Polyline
                coordinates={run.route.map((point) => ({
                  latitude: point.lat,
                  longitude: point.lng,
                }))}
                strokeColor={ROUTE_COLORS[userIndex % ROUTE_COLORS.length]}
                strokeWidth={4}
              />
            )}
            {run.route.length > 0 && Marker && (
              <Marker
                coordinate={{
                  latitude: run.route[0].lat,
                  longitude: run.route[0].lng,
                }}
                title={territory.user_name}
                description={`${territory.user_phone} - ${territory.total_distance.toFixed(2)} km`}
              >
                <View style={[styles.marker, { backgroundColor: ROUTE_COLORS[userIndex % ROUTE_COLORS.length] }]}>
                  <Ionicons name="person" size={16} color="#fff" />
                </View>
              </Marker>
            )}
          </React.Fragment>
        ))
      )}
    </MapView>
  );
}

export default function MapScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [showList, setShowList] = useState(false);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Get user location
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          setUserLocation({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
        }
      } catch (locError) {
        console.log('Location error:', locError);
        // Default to Tashkent
        setUserLocation({ lat: 41.2995, lng: 69.2401 });
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

  const totalRuns = territories.reduce((sum, t) => sum + t.runs.length, 0);
  const totalDistance = territories.reduce((sum, t) => sum + t.total_distance, 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4DA6FF" />
          <Text style={styles.loadingText}>Xarita yuklanmoqda...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show list view
  if (showList) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4DA6FF" />
          }
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Hududlar</Text>
            <TouchableOpacity style={styles.viewToggle} onPress={() => setShowList(false)}>
              <Ionicons name="map" size={20} color="#4DA6FF" />
              <Text style={styles.viewToggleText}>Xarita</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <Ionicons name="people" size={28} color="#4DA6FF" />
              <Text style={styles.statValue}>{territories.length}</Text>
              <Text style={styles.statLabel}>Foydalanuvchilar</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="fitness" size={28} color="#4DA6FF" />
              <Text style={styles.statValue}>{totalRuns}</Text>
              <Text style={styles.statLabel}>Yugurishlar</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="map" size={28} color="#4DA6FF" />
              <Text style={styles.statValue}>{totalDistance.toFixed(1)}</Text>
              <Text style={styles.statLabel}>Jami km</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Faol yuguruvchilar</Text>

          {territories.filter(t => t.runs.length > 0).length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="walk" size={64} color="#2A4A6A" />
              <Text style={styles.emptyText}>Hali yugurish yo'llari yo'q</Text>
              <Text style={styles.emptySubtext}>Hududingizni egallash uchun yuguring!</Text>
            </View>
          ) : (
            territories.filter(t => t.runs.length > 0).map((territory, index) => (
              <View key={territory.user_id} style={styles.territoryCard}>
                <View style={styles.territoryHeader}>
                  <View style={[styles.colorDot, { backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }]} />
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
                    <Text style={styles.runsCount}>{territory.runs.length} yugurish</Text>
                  </View>
                </View>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Barcha foydalanuvchilar</Text>
          {territories.filter(t => t.runs.length === 0).map((territory) => (
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
                <Text style={styles.noRunsText}>Yugurish yo'q</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show map view
  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <WebMapView userLocation={userLocation} territories={territories} />
      ) : (
        <NativeMapView userLocation={userLocation} territories={territories} mapRef={mapRef} />
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Hududlar xaritasi</Text>
          <TouchableOpacity style={styles.viewToggle} onPress={() => setShowList(true)}>
            <Ionicons name="list" size={20} color="#4DA6FF" />
            <Text style={styles.viewToggleText}>Ro'yxat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Faol yuguruvchilar</Text>
          {territories.filter(t => t.runs.length > 0).slice(0, 5).map((territory, index) => (
            <View key={territory.user_id} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }]} />
              <Text style={styles.legendName} numberOfLines={1}>{territory.user_name}</Text>
              <Text style={styles.legendDistance}>{territory.total_distance.toFixed(1)} km</Text>
            </View>
          ))}
          {territories.filter(t => t.runs.length > 0).length === 0 && (
            <Text style={styles.emptyLegendText}>Hali yugurish ma'lumotlari yo'q</Text>
          )}
        </View>
      </SafeAreaView>

      {Platform.OS !== 'web' && (
        <>
          <TouchableOpacity style={styles.locationButton} onPress={centerOnUser}>
            <Ionicons name="locate" size={24} color="#4DA6FF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <Ionicons name="refresh" size={24} color="#4DA6FF" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const mapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#255763' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
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
  webMapContainer: {
    flex: 1,
    position: 'relative',
  },
  staticMapContainer: {
    flex: 1,
    position: 'relative',
  },
  staticMapImage: {
    width: '100%',
    height: '100%',
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#1A3A5C',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  mapPlaceholderTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  mapPlaceholderCoords: {
    fontSize: 14,
    color: '#8BA4C4',
    marginTop: 8,
  },
  openMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4DA6FF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 24,
  },
  openMapButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  mapTapOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -80 }, { translateY: -20 }],
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapTapText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
  },
  webMapOverlay: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(26, 58, 92, 0.95)',
    borderRadius: 12,
    padding: 16,
  },
  webMapOverlayTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 10,
  },
  webMapUser: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  webMapUserName: {
    flex: 1,
    color: '#B8CDE8',
    fontSize: 13,
    marginLeft: 8,
  },
  webMapUserDistance: {
    color: '#4DA6FF',
    fontSize: 12,
    fontWeight: '600',
  },
  webMapNoData: {
    color: '#5A7A9A',
    fontSize: 13,
    fontStyle: 'italic',
  },
  mapFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapFallbackText: {
    color: '#8BA4C4',
    marginTop: 16,
    fontSize: 16,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 39, 68, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: Platform.OS === 'android' ? 40 : 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A5C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewToggleText: {
    color: '#4DA6FF',
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
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
  emptyLegendText: {
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
    elevation: 5,
  },
  scrollContent: {
    padding: 20,
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
