import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Vibration,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { WebView } from 'react-native-webview';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed: number | null;
  accuracy: number | null;
}

// Generate Leaflet HTML with real-time route
function generateLiveMapHTML(
  userLocation: { lat: number; lng: number },
  route: LocationPoint[]
): string {
  const routePoints = route.map(p => `[${p.lat}, ${p.lng}]`).join(',');
  
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
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([${userLocation.lat}, ${userLocation.lng}], 16);

    // White/Light theme tiles from OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    // Route polyline (blue line)
    var routeCoords = [${routePoints}];
    if (routeCoords.length > 0) {
      var polyline = L.polyline(routeCoords, {
        color: '#4DA6FF',
        weight: 5,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(map);

      // Start marker (green)
      L.circleMarker(routeCoords[0], {
        radius: 10,
        fillColor: '#4CAF50',
        color: '#fff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1
      }).addTo(map).bindPopup('<b>Boshlang\\'ich nuqta</b>');

      // Current position marker (blue pulsing)
      var currentPos = routeCoords[routeCoords.length - 1];
      L.circleMarker(currentPos, {
        radius: 12,
        fillColor: '#4DA6FF',
        color: '#fff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1
      }).addTo(map);

      // Pulse effect
      L.circleMarker(currentPos, {
        radius: 25,
        fillColor: '#4DA6FF',
        color: '#4DA6FF',
        weight: 2,
        opacity: 0.3,
        fillOpacity: 0.2
      }).addTo(map);

      // Fit map to show entire route
      if (routeCoords.length > 1) {
        map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
      }
    } else {
      // Just show user location
      L.circleMarker([${userLocation.lat}, ${userLocation.lng}], {
        radius: 10,
        fillColor: '#4DA6FF',
        color: '#fff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1
      }).addTo(map);
    }
  </script>
</body>
</html>
  `;
}

// Web Leaflet Component
function LiveMapWeb({ userLocation, route }: { 
  userLocation: { lat: number; lng: number }; 
  route: LocationPoint[] 
}) {
  const mapRef = useRef<any>(null);
  const leafletMapRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const currentMarkerRef = useRef<any>(null);
  const pulseMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      // Load Leaflet
      const linkEl = document.createElement('link');
      linkEl.rel = 'stylesheet';
      linkEl.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(linkEl);

      const scriptEl = document.createElement('script');
      scriptEl.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      scriptEl.onload = () => {
        initMap();
      };
      document.head.appendChild(scriptEl);

      return () => {
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
        }
      };
    }
  }, []);

  const initMap = () => {
    const L = (window as any).L;
    if (!L) return;

    const mapContainer = document.getElementById('live-map-container');
    if (!mapContainer) return;

    // Clear existing
    mapContainer.innerHTML = '';
    const mapDiv = document.createElement('div');
    mapDiv.id = 'live-map';
    mapDiv.style.width = '100%';
    mapDiv.style.height = '100%';
    mapContainer.appendChild(mapDiv);

    const map = L.map('live-map', {
      zoomControl: false,
      attributionControl: false
    }).setView([userLocation.lat, userLocation.lng], 16);

    // Light/white tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    leafletMapRef.current = map;

    // Initialize polyline
    polylineRef.current = L.polyline([], {
      color: '#4DA6FF',
      weight: 5,
      opacity: 0.9
    }).addTo(map);

    // Current position marker
    currentMarkerRef.current = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 12,
      fillColor: '#4DA6FF',
      color: '#fff',
      weight: 3,
      fillOpacity: 1
    }).addTo(map);

    // Pulse
    pulseMarkerRef.current = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 25,
      fillColor: '#4DA6FF',
      color: '#4DA6FF',
      weight: 2,
      opacity: 0.3,
      fillOpacity: 0.2
    }).addTo(map);
  };

  useEffect(() => {
    if (Platform.OS === 'web' && leafletMapRef.current && route.length > 0) {
      const L = (window as any).L;
      const latLngs = route.map(p => [p.lat, p.lng]);
      
      // Update polyline
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(latLngs);
      }

      // Update current position
      const lastPos = route[route.length - 1];
      if (currentMarkerRef.current) {
        currentMarkerRef.current.setLatLng([lastPos.lat, lastPos.lng]);
      }
      if (pulseMarkerRef.current) {
        pulseMarkerRef.current.setLatLng([lastPos.lat, lastPos.lng]);
      }

      // Pan to current position
      leafletMapRef.current.panTo([lastPos.lat, lastPos.lng]);
    }
  }, [route]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.mapContainer}>
        <div 
          id="live-map-container" 
          style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
        />
      </View>
    );
  }

  // Native - use WebView
  const htmlContent = generateLiveMapHTML(userLocation, route);
  return (
    <View style={styles.mapContainer}>
      <WebView
        key={route.length} // Force refresh on route update
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

export default function RunScreen() {
  const { token, refreshUser } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0);
  const [calories, setCalories] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [route, setRoute] = useState<LocationPoint[]>([]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({ lat: 41.2995, lng: 69.2401 });
  const [showMap, setShowMap] = useState(true);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocation = useRef<LocationPoint | null>(null);
  const distanceRef = useRef(0);
  const maxSpeedRef = useRef(0);

  useEffect(() => {
    // Get initial location
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          setUserLocation({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
        }
      } catch (e) {
        console.log('Initial location error:', e);
      }
    })();

    return () => {
      cleanupTracking();
    };
  }, []);

  useEffect(() => {
    if (duration > 0 && distance > 0) {
      const avgKmH = (distance / 1000) / (duration / 3600);
      setAvgSpeed(avgKmH);
    }
  }, [distance, duration]);

  useEffect(() => {
    const kmRun = distance / 1000;
    setCalories(Math.round(kmRun * 60));
  }, [distance]);

  const cleanupTracking = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRad = (deg: number): number => deg * (Math.PI / 180);

  const handleLocationUpdate = useCallback((location: Location.LocationObject) => {
    const newPoint: LocationPoint = {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      timestamp: Date.now(),
      speed: location.coords.speed,
      accuracy: location.coords.accuracy,
    };

    setUserLocation({ lat: newPoint.lat, lng: newPoint.lng });
    setGpsAccuracy(location.coords.accuracy);

    let speedKmH = 0;
    if (location.coords.speed !== null && location.coords.speed >= 0) {
      speedKmH = location.coords.speed * 3.6;
    } else if (lastLocation.current) {
      const timeDiff = (newPoint.timestamp - lastLocation.current.timestamp) / 1000;
      if (timeDiff > 0) {
        const dist = calculateDistance(
          lastLocation.current.lat,
          lastLocation.current.lng,
          newPoint.lat,
          newPoint.lng
        );
        speedKmH = (dist / 1000) / (timeDiff / 3600);
      }
    }

    if (speedKmH > 50) speedKmH = currentSpeed;
    setCurrentSpeed(speedKmH);

    if (speedKmH > maxSpeedRef.current) {
      maxSpeedRef.current = speedKmH;
      setMaxSpeed(speedKmH);
    }

    if (lastLocation.current) {
      const dist = calculateDistance(
        lastLocation.current.lat,
        lastLocation.current.lng,
        newPoint.lat,
        newPoint.lng
      );
      
      if (dist < 100 && (location.coords.accuracy === null || location.coords.accuracy < 50)) {
        distanceRef.current += dist;
        setDistance(distanceRef.current);
      }
    }

    lastLocation.current = newPoint;
    setRoute(prev => [...prev, newPoint]);
  }, [currentSpeed]);

  const startTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Ruxsat kerak', 'Yugurishni kuzatish uchun joylashuv ruxsati kerak.');
        return;
      }

      if (Platform.OS !== 'web') {
        Vibration.vibrate(100);
      }

      setIsRunning(true);
      setIsPaused(false);
      setDistance(0);
      setDuration(0);
      setCurrentSpeed(0);
      setAvgSpeed(0);
      setMaxSpeed(0);
      setCalories(0);
      setRoute([]);
      setStartTime(new Date());
      lastLocation.current = null;
      distanceRef.current = 0;
      maxSpeedRef.current = 0;

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 2,
        },
        handleLocationUpdate
      );
    } catch (error) {
      console.error('Error starting tracking:', error);
      Alert.alert('Xato', 'Kuzatishni boshlashda xato.');
    }
  };

  const pauseTracking = () => {
    if (Platform.OS !== 'web') Vibration.vibrate(50);
    setIsPaused(true);
    setCurrentSpeed(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
  };

  const resumeTracking = async () => {
    if (Platform.OS !== 'web') Vibration.vibrate(50);
    setIsPaused(false);
    
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 2,
      },
      handleLocationUpdate
    );
  };

  const stopTracking = async () => {
    if (Platform.OS !== 'web') Vibration.vibrate([100, 50, 100]);
    
    cleanupTracking();

    if (isRunning && route.length > 0 && startTime && token) {
      try {
        const distanceKm = distance / 1000;
        await axios.post(`${API_URL}/api/runs?token=${token}`, {
          route: route,
          distance: distanceKm,
          duration: duration,
          start_time: startTime.toISOString(),
          end_time: new Date().toISOString(),
        });
        await refreshUser();
        Alert.alert(
          'Yugurish saqlandi! ✓',
          `Ajoyib! ${formatDistance(distance)} masofani ${formatDuration(duration)} da bosib o'tdingiz.\n\nYugurish yo'lingiz xaritada saqlandi!`
        );
      } catch (error) {
        console.error('Error saving run:', error);
        Alert.alert('Xato', 'Yugurishni saqlashda xato.');
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    setDistance(0);
    setDuration(0);
    setCurrentSpeed(0);
    setAvgSpeed(0);
    setMaxSpeed(0);
    setCalories(0);
    setRoute([]);
    setStartTime(null);
    setGpsAccuracy(null);
    lastLocation.current = null;
    distanceRef.current = 0;
    maxSpeedRef.current = 0;
  };

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  };

  const getGpsColor = (): string => {
    if (gpsAccuracy === null) return '#5A7A9A';
    if (gpsAccuracy <= 5) return '#4CAF50';
    if (gpsAccuracy <= 10) return '#8BC34A';
    if (gpsAccuracy <= 20) return '#FFEB3B';
    if (gpsAccuracy <= 50) return '#FF9800';
    return '#FF5722';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Yugurish</Text>
          <View style={styles.headerButtons}>
            {isRunning && (
              <View style={styles.gpsIndicator}>
                <View style={[styles.gpsDot, { backgroundColor: getGpsColor() }]} />
                <Text style={styles.gpsText}>{gpsAccuracy ? `${Math.round(gpsAccuracy)}m` : 'GPS'}</Text>
              </View>
            )}
            <TouchableOpacity 
              style={styles.mapToggle} 
              onPress={() => setShowMap(!showMap)}
            >
              <Ionicons name={showMap ? "stats-chart" : "map"} size={20} color="#4DA6FF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Map */}
        {showMap && (
          <LiveMapWeb userLocation={userLocation} route={route} />
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.mainStat}>
            <Text style={styles.mainStatValue}>
              {distance < 1000 ? Math.round(distance) : (distance / 1000).toFixed(2)}
            </Text>
            <Text style={styles.mainStatLabel}>{distance < 1000 ? 'metr' : 'km'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.mainStat}>
            <Text style={styles.mainStatValue}>{currentSpeed.toFixed(1)}</Text>
            <Text style={styles.mainStatLabel}>km/soat</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.mainStat}>
            <Text style={styles.mainStatValue}>{formatDuration(duration)}</Text>
            <Text style={styles.mainStatLabel}>vaqt</Text>
          </View>
        </View>

        {/* Secondary Stats */}
        {!showMap && (
          <View style={styles.secondaryStats}>
            <View style={styles.secondaryStat}>
              <Ionicons name="trending-up" size={18} color="#FF9500" />
              <Text style={styles.secondaryValue}>{maxSpeed.toFixed(1)}</Text>
              <Text style={styles.secondaryLabel}>Max km/h</Text>
            </View>
            <View style={styles.secondaryStat}>
              <Ionicons name="analytics" size={18} color="#4DA6FF" />
              <Text style={styles.secondaryValue}>{avgSpeed.toFixed(1)}</Text>
              <Text style={styles.secondaryLabel}>O'rtacha</Text>
            </View>
            <View style={styles.secondaryStat}>
              <Ionicons name="flame" size={18} color="#FF6B6B" />
              <Text style={styles.secondaryValue}>{calories}</Text>
              <Text style={styles.secondaryLabel}>Kaloriya</Text>
            </View>
          </View>
        )}

        {/* Control Buttons */}
        <View style={styles.buttonContainer}>
          {!isRunning ? (
            <TouchableOpacity style={styles.startButton} onPress={startTracking}>
              <Ionicons name="play" size={40} color="#fff" />
              <Text style={styles.buttonText}>BOSHLASH</Text>
            </TouchableOpacity>
          ) : isPaused ? (
            <View style={styles.controlButtons}>
              <TouchableOpacity style={styles.resumeButton} onPress={resumeTracking}>
                <Ionicons name="play" size={28} color="#fff" />
                <Text style={styles.smallButtonText}>Davom</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopButton} onPress={stopTracking}>
                <Ionicons name="stop" size={28} color="#fff" />
                <Text style={styles.smallButtonText}>Tugatish</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.pauseButton} onPress={pauseTracking}>
              <Ionicons name="pause" size={40} color="#fff" />
              <Text style={styles.buttonText}>TO'XTATISH</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status */}
        {isRunning && (
          <View style={styles.statusBar}>
            <View style={[styles.statusDot, isPaused && styles.statusDotPaused]} />
            <Text style={styles.statusText}>
              {isPaused ? 'To\'xtatildi' : `Kuzatilmoqda • ${route.length} nuqta`}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2744',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gpsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A5C',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  gpsText: {
    color: '#B8CDE8',
    fontSize: 12,
  },
  mapToggle: {
    backgroundColor: '#1A3A5C',
    padding: 10,
    borderRadius: 8,
  },
  mapContainer: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#E8E8E8',
  },
  webview: {
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  mainStat: {
    flex: 1,
    alignItems: 'center',
  },
  mainStatValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4DA6FF',
  },
  mainStatLabel: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2A4A6A',
    marginHorizontal: 12,
  },
  secondaryStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  secondaryStat: {
    flex: 1,
    backgroundColor: '#1A3A5C',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  secondaryValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 4,
  },
  secondaryLabel: {
    fontSize: 10,
    color: '#8BA4C4',
    marginTop: 2,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#4DA6FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4DA6FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
  pauseButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#FF9500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 6,
  },
  controlButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  resumeButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#4DA6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4DA6FF',
    marginRight: 8,
  },
  statusDotPaused: {
    backgroundColor: '#FF9500',
  },
  statusText: {
    color: '#8BA4C4',
    fontSize: 13,
  },
});
