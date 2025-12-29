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
import { WebView } from 'react-native-webview';

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

// Generate Leaflet HTML for WebView
function generateLeafletHTML(
  userLocation: { lat: number; lng: number },
  territories: Territory[]
): string {
  const markers = territories
    .filter(t => t.runs.length > 0)
    .map((t, i) => {
      const runs = t.runs.map((run, runIndex) => {
        if (run.route.length === 0) return '';
        
        const polylinePoints = run.route.map(p => `[${p.lat}, ${p.lng}]`).join(',');
        const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
        
        const markerPoint = run.route[0];
        return `
          // Polyline for run
          L.polyline([${polylinePoints}], {
            color: '${color}',
            weight: 4,
            opacity: 0.8
          }).addTo(map);
          
          // Marker at start
          L.circleMarker([${markerPoint.lat}, ${markerPoint.lng}], {
            radius: 10,
            fillColor: '${color}',
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
          }).addTo(map).bindPopup('<b>${t.user_name}</b><br>${t.user_phone}<br>${t.total_distance.toFixed(2)} km');
        `;
      }).join('\n');
      
      return runs;
    }).join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; }
    #map { height: 100%; width: 100%; }
    .leaflet-control-attribution { display: none; }
    .custom-popup .leaflet-popup-content-wrapper {
      background: #1A3A5C;
      color: #fff;
      border-radius: 8px;
    }
    .custom-popup .leaflet-popup-tip {
      background: #1A3A5C;
    }
    .leaflet-popup-content {
      margin: 10px 12px;
    }
    .leaflet-popup-content b {
      color: #4DA6FF;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([${userLocation.lat}, ${userLocation.lng}], 14);

    // Dark theme tiles from CartoDB
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    // User location marker
    L.circleMarker([${userLocation.lat}, ${userLocation.lng}], {
      radius: 8,
      fillColor: '#4DA6FF',
      color: '#fff',
      weight: 3,
      opacity: 1,
      fillOpacity: 1
    }).addTo(map).bindPopup('<b>Sizning joylashuvingiz</b>');

    // Add pulse animation for user location
    L.circleMarker([${userLocation.lat}, ${userLocation.lng}], {
      radius: 20,
      fillColor: '#4DA6FF',
      color: '#4DA6FF',
      weight: 1,
      opacity: 0.3,
      fillOpacity: 0.2
    }).addTo(map);

    ${markers}
  </script>
</body>
</html>
  `;
}

// Leaflet Map Component for Web
function LeafletWebMap({ userLocation, territories }: { 
  userLocation: { lat: number; lng: number }; 
  territories: Territory[] 
}) {
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    // Dynamically load Leaflet CSS and JS for web
    if (Platform.OS === 'web') {
      const linkEl = document.createElement('link');
      linkEl.rel = 'stylesheet';
      linkEl.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(linkEl);

      const scriptEl = document.createElement('script');
      scriptEl.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      scriptEl.onload = () => setMapLoaded(true);
      document.head.appendChild(scriptEl);

      return () => {
        document.head.removeChild(linkEl);
        document.head.removeChild(scriptEl);
      };
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && mapLoaded && (window as any).L) {
      const mapContainer = document.getElementById('leaflet-map-container');
      if (mapContainer && !mapContainer.hasChildNodes()) {
        const mapDiv = document.createElement('div');
        mapDiv.id = 'leaflet-map';
        mapDiv.style.width = '100%';
        mapDiv.style.height = '100%';
        mapContainer.appendChild(mapDiv);

        const L = (window as any).L;
        const map = L.map('leaflet-map').setView([userLocation.lat, userLocation.lng], 14);

        // White/Light theme tiles from OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: ''
        }).addTo(map);

        // User location marker
        L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 8,
          fillColor: '#4DA6FF',
          color: '#fff',
          weight: 3,
          opacity: 1,
          fillOpacity: 1
        }).addTo(map).bindPopup('<b>Sizning joylashuvingiz</b>');

        // Pulse effect
        L.circleMarker([userLocation.lat, userLocation.lng], {
          radius: 20,
          fillColor: '#4DA6FF',
          color: '#4DA6FF',
          weight: 1,
          opacity: 0.3,
          fillOpacity: 0.2
        }).addTo(map);

        // Add territories
        territories.forEach((territory, i) => {
          territory.runs.forEach(run => {
            if (run.route.length > 0) {
              const color = ROUTE_COLORS[i % ROUTE_COLORS.length];
              
              // Polyline
              if (run.route.length > 1) {
                const latLngs = run.route.map(p => [p.lat, p.lng]);
                L.polyline(latLngs, {
                  color: color,
                  weight: 4,
                  opacity: 0.8
                }).addTo(map);
              }

              // Marker
              L.circleMarker([run.route[0].lat, run.route[0].lng], {
                radius: 10,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
              }).addTo(map).bindPopup(
                `<b style="color: ${color}">${territory.user_name}</b><br>` +
                `${territory.user_phone}<br>` +
                `<span style="color: #4DA6FF">${territory.total_distance.toFixed(2)} km</span>`
              );
            }
          });
        });
      }
    }
  }, [mapLoaded, userLocation, territories]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.leafletContainer}>
        <div 
          id="leaflet-map-container" 
          style={{ width: '100%', height: '100%', backgroundColor: '#0F2744' }}
        />
        {!mapLoaded && (
          <View style={styles.mapLoading}>
            <ActivityIndicator size="large" color="#4DA6FF" />
            <Text style={styles.mapLoadingText}>Xarita yuklanmoqda...</Text>
          </View>
        )}
      </View>
    );
  }

  // For native platforms, use WebView with Leaflet HTML
  const htmlContent = generateLeafletHTML(userLocation, territories);
  
  return (
    <WebView
      style={styles.webview}
      originWhitelist={['*']}
      source={{ html: htmlContent }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      startInLoadingState={true}
      renderLoading={() => (
        <View style={styles.mapLoading}>
          <ActivityIndicator size="large" color="#4DA6FF" />
          <Text style={styles.mapLoadingText}>Xarita yuklanmoqda...</Text>
        </View>
      )}
    />
  );
}

export default function MapScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 41.2995, lng: 69.2401 });
  const [showList, setShowList] = useState(false);

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
      <LeafletWebMap userLocation={userLocation} territories={territories} />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Hududlar xaritasi</Text>
          <TouchableOpacity style={styles.viewToggle} onPress={() => setShowList(true)}>
            <Ionicons name="list" size={20} color="#4DA6FF" />
            <Text style={styles.viewToggleText}>Ro'yxat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Xaritadagi foydalanuvchilar</Text>
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

      <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
        <Ionicons name="refresh" size={24} color="#4DA6FF" />
      </TouchableOpacity>
    </View>
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
  leafletContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0F2744',
  },
  mapLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F2744',
  },
  mapLoadingText: {
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
    backgroundColor: 'rgba(15, 39, 68, 0.95)',
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
    color: '#4DA6FF',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyLegendText: {
    color: '#5A7A9A',
    fontSize: 14,
    fontStyle: 'italic',
  },
  refreshButton: {
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
