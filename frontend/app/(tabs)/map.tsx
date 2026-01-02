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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { WebView } from 'react-native-webview';
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
    created_at: string;
  }>;
}

const ROUTE_COLORS = [
  '#4DA6FF', '#FF6B6B', '#4CAF50', '#FF9500', '#9C27B0',
  '#00BCD4', '#E91E63', '#8BC34A', '#795548', '#607D8B',
];

// Generate Leaflet HTML with filled polygons and avatar markers
function generateLeafletHTML(
  userLocation: { lat: number; lng: number },
  territories: Territory[],
  currentUserId?: string
): string {
  // Sort all runs by created_at to determine overlap priority (newest wins)
  const allRuns: Array<{
    run: any;
    territory: Territory;
    colorIndex: number;
    createdAt: Date;
  }> = [];

  territories.forEach((territory, index) => {
    territory.runs.forEach(run => {
      if (run.route.length > 2) {
        allRuns.push({
          run,
          territory,
          colorIndex: index,
          createdAt: new Date(run.created_at)
        });
      }
    });
  });

  // Sort by creation time (oldest first, so newest draws on top)
  allRuns.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Generate polygon and polyline code for each run
  const polygonsCode = allRuns.map(({ run, territory, colorIndex }) => {
    const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];
    const coords = run.route.map((p: any) => `[${p.lat}, ${p.lng}]`).join(',');
    
    return `
      // Territory polygon for ${territory.user_name}
      L.polygon([${coords}], {
        color: '${color}',
        weight: 3,
        opacity: 0.8,
        fillColor: '${color}',
        fillOpacity: 0.25
      }).addTo(map).bindPopup('<b style="color: ${color}">${territory.user_name}</b><br>${territory.user_phone}<br><span style="color: ${color}">${territory.total_distance.toFixed(2)} km</span>');
      
      // Route line
      L.polyline([${coords}], {
        color: '${color}',
        weight: 4,
        opacity: 0.9
      }).addTo(map);
    `;
  }).join('\n');

  // Generate avatar markers for each user
  const markersCode = territories.map((territory, index) => {
    if (territory.runs.length === 0 || territory.runs[0].route.length === 0) return '';
    
    const latestRun = territory.runs[0];
    const startPoint = latestRun.route[0];
    const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
    const hasAvatar = territory.user_avatar && territory.user_avatar.length > 0;
    const initial = territory.user_name.charAt(0).toUpperCase();
    
    if (hasAvatar) {
      return `
        // Avatar marker for ${territory.user_name}
        var avatarIcon${index} = L.divIcon({
          className: 'avatar-marker',
          html: '<div style="width: 44px; height: 44px; border-radius: 50%; border: 3px solid ${color}; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"><img src="${territory.user_avatar}" style="width: 100%; height: 100%; object-fit: cover;" /></div>',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          popupAnchor: [0, -22]
        });
        L.marker([${startPoint.lat}, ${startPoint.lng}], { icon: avatarIcon${index} })
          .addTo(map)
          .bindPopup('<b style="color: ${color}">${territory.user_name}</b><br>${territory.user_phone}<br><b>${territory.total_distance.toFixed(2)} km</b>');
      `;
    } else {
      return `
        // Initial marker for ${territory.user_name}
        var initialIcon${index} = L.divIcon({
          className: 'initial-marker',
          html: '<div style="width: 44px; height: 44px; border-radius: 50%; background: ${color}; border: 3px solid #fff; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; font-size: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">${initial}</div>',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          popupAnchor: [0, -22]
        });
        L.marker([${startPoint.lat}, ${startPoint.lng}], { icon: initialIcon${index} })
          .addTo(map)
          .bindPopup('<b style="color: ${color}">${territory.user_name}</b><br>${territory.user_phone}<br><b>${territory.total_distance.toFixed(2)} km</b>');
      `;
    }
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
    .leaflet-popup-content-wrapper {
      background: #1A3A5C;
      color: #fff;
      border-radius: 10px;
    }
    .leaflet-popup-tip {
      background: #1A3A5C;
    }
    .leaflet-popup-content {
      margin: 12px 14px;
      font-size: 13px;
    }
    .avatar-marker, .initial-marker {
      background: transparent !important;
      border: none !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([${userLocation.lat}, ${userLocation.lng}], 15);

    // Light/White OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    // Draw all territory polygons (oldest first, newest on top)
    ${polygonsCode}

    // Draw user avatar markers
    ${markersCode}

    // Current user location
    L.circleMarker([${userLocation.lat}, ${userLocation.lng}], {
      radius: 8,
      fillColor: '#4DA6FF',
      color: '#fff',
      weight: 3,
      opacity: 1,
      fillOpacity: 1
    }).addTo(map).bindPopup('<b>Sizning joylashuvingiz</b>');

    // Pulse effect for user location
    L.circleMarker([${userLocation.lat}, ${userLocation.lng}], {
      radius: 20,
      fillColor: '#4DA6FF',
      color: '#4DA6FF',
      weight: 2,
      opacity: 0.3,
      fillOpacity: 0.15
    }).addTo(map);

    // Fit bounds to show all territories
    var allCoords = [];
    ${territories.map((t, i) => 
      t.runs.map(r => 
        r.route.map((p: any) => `allCoords.push([${p.lat}, ${p.lng}]);`).join('')
      ).join('')
    ).join('')}
    
    if (allCoords.length > 0) {
      var bounds = L.latLngBounds(allCoords);
      bounds.extend([${userLocation.lat}, ${userLocation.lng}]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  </script>
</body>
</html>
  `;
}

// Leaflet Map Component
function LeafletMap({ userLocation, territories, currentUserId }: { 
  userLocation: { lat: number; lng: number }; 
  territories: Territory[];
  currentUserId?: string;
}) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = React.useRef<any>(null);
  const leafletMapRef = React.useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const linkEl = document.createElement('link');
      linkEl.rel = 'stylesheet';
      linkEl.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(linkEl);

      const scriptEl = document.createElement('script');
      scriptEl.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      scriptEl.onload = () => {
        setMapLoaded(true);
        initializeWebMap();
      };
      document.head.appendChild(scriptEl);

      return () => {
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
        }
      };
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && mapLoaded) {
      initializeWebMap();
    }
  }, [mapLoaded, territories, userLocation]);

  const initializeWebMap = () => {
    const L = (window as any).L;
    if (!L) return;

    const container = document.getElementById('territory-map-container');
    if (!container) return;

    // Clear existing map
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
    }
    container.innerHTML = '';

    const mapDiv = document.createElement('div');
    mapDiv.id = 'territory-map';
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    container.appendChild(mapDiv);

    const map = L.map('territory-map', {
      zoomControl: true,
      attributionControl: false
    }).setView([userLocation.lat, userLocation.lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    leafletMapRef.current = map;

    // Sort runs by created_at for overlap priority
    const allRuns: any[] = [];
    territories.forEach((territory, index) => {
      territory.runs.forEach(run => {
        if (run.route.length > 2) {
          allRuns.push({
            run,
            territory,
            colorIndex: index,
            createdAt: new Date(run.created_at)
          });
        }
      });
    });
    allRuns.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Draw polygons and routes (oldest first)
    allRuns.forEach(({ run, territory, colorIndex }) => {
      const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];
      const latLngs = run.route.map((p: any) => [p.lat, p.lng]);

      // Filled polygon with transparency
      L.polygon(latLngs, {
        color: color,
        weight: 3,
        opacity: 0.8,
        fillColor: color,
        fillOpacity: 0.25
      }).addTo(map).bindPopup(
        `<b style="color: ${color}">${territory.user_name}</b><br>` +
        `${territory.user_phone}<br>` +
        `<span style="color: ${color}; font-weight: bold">${territory.total_distance.toFixed(2)} km</span>`
      );

      // Route line
      L.polyline(latLngs, {
        color: color,
        weight: 4,
        opacity: 0.9
      }).addTo(map);
    });

    // Draw markers for each user
    territories.forEach((territory, index) => {
      if (territory.runs.length === 0 || territory.runs[0].route.length === 0) return;

      const latestRun = territory.runs[0];
      const startPoint = latestRun.route[0];
      const color = ROUTE_COLORS[index % ROUTE_COLORS.length];

      L.circleMarker([startPoint.lat, startPoint.lng], {
        radius: 12,
        fillColor: color,
        color: '#fff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1
      }).addTo(map).bindPopup(
        `<b style="color: ${color}">${territory.user_name}</b><br>` +
        `${territory.user_phone}<br>` +
        `<b>${territory.total_distance.toFixed(2)} km</b>`
      );
    });

    // Current user location
    L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 8,
      fillColor: '#4DA6FF',
      color: '#fff',
      weight: 3,
      fillOpacity: 1
    }).addTo(map).bindPopup('<b>Sizning joylashuvingiz</b>');

    L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 20,
      fillColor: '#4DA6FF',
      color: '#4DA6FF',
      weight: 2,
      opacity: 0.3,
      fillOpacity: 0.15
    }).addTo(map);

    // Fit bounds
    const allCoords: any[] = [[userLocation.lat, userLocation.lng]];
    territories.forEach(t => {
      t.runs.forEach(r => {
        r.route.forEach(p => allCoords.push([p.lat, p.lng]));
      });
    });

    if (allCoords.length > 1) {
      const bounds = L.latLngBounds(allCoords);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={styles.mapContainer}>
        <div 
          id="territory-map-container" 
          style={{ width: '100%', height: '100%' }}
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

  // Native - WebView
  const htmlContent = generateLeafletHTML(userLocation, territories, currentUserId);
  return (
    <View style={styles.mapContainer}>
      <WebView
        key={`map-${territories.length}-${Date.now()}`}
        style={styles.webview}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
      />
    </View>
  );
}

export default function MapScreen() {
  const { user, token } = useAuth();
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

  // List view
  if (showList) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4DA6FF" />}
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
            </View>
          ) : (
            territories.filter(t => t.runs.length > 0).map((territory, index) => (
              <View key={territory.user_id} style={styles.territoryCard}>
                <View style={[styles.colorBar, { backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }]} />
                <View style={styles.territoryContent}>
                  <View style={styles.territoryHeader}>
                    {territory.user_avatar ? (
                      <Image source={{ uri: territory.user_avatar }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatarPlaceholder, { backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] + '33' }]}>
                        <Ionicons name="person" size={18} color={ROUTE_COLORS[index % ROUTE_COLORS.length]} />
                      </View>
                    )}
                    <View style={styles.territoryInfo}>
                      <Text style={styles.territoryName}>{territory.user_name}</Text>
                      <Text style={styles.territoryPhone}>{territory.user_phone}</Text>
                    </View>
                    <View style={styles.territoryStats}>
                      <Text style={[styles.distanceValue, { color: ROUTE_COLORS[index % ROUTE_COLORS.length] }]}>
                        {territory.total_distance.toFixed(2)} km
                      </Text>
                      <Text style={styles.runsCount}>{territory.runs.length} yugurish</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Map view
  return (
    <View style={styles.container}>
      <LeafletMap 
        userLocation={userLocation} 
        territories={territories} 
        currentUserId={user?.id}
      />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Hududlar xaritasi</Text>
          <TouchableOpacity style={styles.viewToggle} onPress={() => setShowList(true)}>
            <Ionicons name="list" size={20} color="#4DA6FF" />
            <Text style={styles.viewToggleText}>Ro'yxat</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Hududlar</Text>
          {territories.filter(t => t.runs.length > 0).slice(0, 5).map((territory, index) => (
            <View key={territory.user_id} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: ROUTE_COLORS[index % ROUTE_COLORS.length] }]} />
              <Text style={styles.legendName} numberOfLines={1}>{territory.user_name}</Text>
              <Text style={[styles.legendDistance, { color: ROUTE_COLORS[index % ROUTE_COLORS.length] }]}>
                {territory.total_distance.toFixed(1)} km
              </Text>
            </View>
          ))}
          {territories.filter(t => t.runs.length > 0).length === 0 && (
            <Text style={styles.emptyLegendText}>Hali hudud yo'q</Text>
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
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
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
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 10,
  },
  legendName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  legendDistance: {
    fontSize: 13,
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
  },
  emptyCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#8BA4C4',
    marginTop: 16,
  },
  territoryCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  colorBar: {
    width: 6,
  },
  territoryContent: {
    flex: 1,
    padding: 14,
  },
  territoryHeader: {
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
  },
  runsCount: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 2,
  },
});
