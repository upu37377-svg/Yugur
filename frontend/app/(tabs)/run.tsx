import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface LocationPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed: number | null;
  accuracy: number | null;
}

export default function RunScreen() {
  const { token, refreshUser } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [distance, setDistance] = useState(0); // in meters
  const [duration, setDuration] = useState(0); // in seconds
  const [currentSpeed, setCurrentSpeed] = useState(0); // in km/h
  const [avgSpeed, setAvgSpeed] = useState(0); // in km/h
  const [maxSpeed, setMaxSpeed] = useState(0); // in km/h
  const [calories, setCalories] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [route, setRoute] = useState<LocationPoint[]>([]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocation = useRef<LocationPoint | null>(null);
  const distanceRef = useRef(0);
  const maxSpeedRef = useRef(0);

  useEffect(() => {
    return () => {
      cleanupTracking();
    };
  }, []);

  // Calculate average speed whenever distance or duration changes
  useEffect(() => {
    if (duration > 0 && distance > 0) {
      const avgKmH = (distance / 1000) / (duration / 3600);
      setAvgSpeed(avgKmH);
    }
  }, [distance, duration]);

  // Calculate calories (rough estimate: ~60 cal per km for running)
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
    const R = 6371000; // Earth's radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // returns meters
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

    // Update GPS accuracy
    setGpsAccuracy(location.coords.accuracy);

    // Calculate current speed from GPS or from distance/time
    let speedKmH = 0;
    if (location.coords.speed !== null && location.coords.speed >= 0) {
      speedKmH = location.coords.speed * 3.6; // m/s to km/h
    } else if (lastLocation.current) {
      const timeDiff = (newPoint.timestamp - lastLocation.current.timestamp) / 1000; // seconds
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

    // Filter out unrealistic speeds (> 50 km/h for running)
    if (speedKmH > 50) speedKmH = currentSpeed;
    
    setCurrentSpeed(speedKmH);

    // Update max speed
    if (speedKmH > maxSpeedRef.current) {
      maxSpeedRef.current = speedKmH;
      setMaxSpeed(speedKmH);
    }

    // Calculate distance from last point
    if (lastLocation.current) {
      const dist = calculateDistance(
        lastLocation.current.lat,
        lastLocation.current.lng,
        newPoint.lat,
        newPoint.lng
      );
      
      // Only add distance if it's reasonable (not GPS jump)
      // and accuracy is good enough
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

      // Vibrate to indicate start
      if (Platform.OS !== 'web') {
        Vibration.vibrate(100);
      }

      // Reset all values
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

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      // Start location tracking with high accuracy
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000, // Update every second
          distanceInterval: 1, // Update every 1 meter
        },
        handleLocationUpdate
      );
    } catch (error) {
      console.error('Error starting tracking:', error);
      Alert.alert('Xato', 'Kuzatishni boshlashda xato. Qaytadan urinib ko\'ring.');
    }
  };

  const pauseTracking = () => {
    if (Platform.OS !== 'web') {
      Vibration.vibrate(50);
    }
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
    if (Platform.OS !== 'web') {
      Vibration.vibrate(50);
    }
    setIsPaused(false);
    
    // Resume timer
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    // Resume location tracking
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
      },
      handleLocationUpdate
    );
  };

  const stopTracking = async () => {
    if (Platform.OS !== 'web') {
      Vibration.vibrate([100, 50, 100]);
    }
    
    cleanupTracking();

    // Save run if we have data
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
          'Yugurish saqlandi!',
          `Ajoyib! Siz ${formatDistance(distance)} masofani ${formatDuration(duration)} da bosib o'tdingiz.\n\nO'rtacha tezlik: ${avgSpeed.toFixed(1)} km/soat\nMax tezlik: ${maxSpeed.toFixed(1)} km/soat\nKaloriya: ~${calories} kcal`
        );
      } catch (error) {
        console.error('Error saving run:', error);
        Alert.alert('Xato', 'Yugurishni saqlashda xato. Qaytadan urinib ko\'ring.');
      }
    }

    // Reset state
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

  const calculatePace = (): string => {
    const km = distance / 1000;
    if (km <= 0) return '--:--';
    const paceSeconds = duration / km; // seconds per km
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getGpsAccuracyColor = (): string => {
    if (gpsAccuracy === null) return '#5A7A9A';
    if (gpsAccuracy <= 5) return '#4CAF50'; // Excellent
    if (gpsAccuracy <= 10) return '#8BC34A'; // Good
    if (gpsAccuracy <= 20) return '#FFEB3B'; // Fair
    if (gpsAccuracy <= 50) return '#FF9800'; // Poor
    return '#FF5722'; // Very poor
  };

  const getGpsAccuracyText = (): string => {
    if (gpsAccuracy === null) return 'GPS kutilmoqda...';
    if (gpsAccuracy <= 5) return 'A\'lo';
    if (gpsAccuracy <= 10) return 'Yaxshi';
    if (gpsAccuracy <= 20) return 'O\'rtacha';
    if (gpsAccuracy <= 50) return 'Yomon';
    return 'Juda yomon';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Yugurish</Text>
          {isRunning && (
            <View style={styles.gpsIndicator}>
              <View style={[styles.gpsDot, { backgroundColor: getGpsAccuracyColor() }]} />
              <Text style={styles.gpsText}>{getGpsAccuracyText()}</Text>
            </View>
          )}
        </View>

        {/* Main Distance Display */}
        <View style={styles.mainStatContainer}>
          <Text style={styles.distanceValue}>
            {distance < 1000 
              ? Math.round(distance) 
              : (distance / 1000).toFixed(2)
            }
          </Text>
          <Text style={styles.distanceUnit}>
            {distance < 1000 ? 'metr' : 'kilometr'}
          </Text>
        </View>

        {/* Speed Display */}
        <View style={styles.speedContainer}>
          <View style={styles.speedBox}>
            <Ionicons name="speedometer" size={28} color="#4DA6FF" />
            <Text style={styles.speedValue}>{currentSpeed.toFixed(1)}</Text>
            <Text style={styles.speedLabel}>km/soat</Text>
            <Text style={styles.speedSubLabel}>Hozirgi tezlik</Text>
          </View>
          <View style={styles.speedDivider} />
          <View style={styles.speedBox}>
            <Ionicons name="trending-up" size={28} color="#FF9500" />
            <Text style={styles.speedValue}>{maxSpeed.toFixed(1)}</Text>
            <Text style={styles.speedLabel}>km/soat</Text>
            <Text style={styles.speedSubLabel}>Max tezlik</Text>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Ionicons name="time" size={22} color="#4DA6FF" />
            <Text style={styles.statValue}>{formatDuration(duration)}</Text>
            <Text style={styles.statLabel}>Vaqt</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="walk" size={22} color="#4DA6FF" />
            <Text style={styles.statValue}>{calculatePace()}</Text>
            <Text style={styles.statLabel}>Tezlik (min/km)</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="analytics" size={22} color="#4DA6FF" />
            <Text style={styles.statValue}>{avgSpeed.toFixed(1)}</Text>
            <Text style={styles.statLabel}>O'rtacha km/soat</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="flame" size={22} color="#FF6B6B" />
            <Text style={styles.statValue}>{calories}</Text>
            <Text style={styles.statLabel}>Kaloriya</Text>
          </View>
        </View>

        {/* Control Buttons */}
        <View style={styles.buttonContainer}>
          {!isRunning ? (
            <TouchableOpacity style={styles.startButton} onPress={startTracking}>
              <Ionicons name="play" size={48} color="#fff" />
              <Text style={styles.startButtonText}>BOSHLASH</Text>
            </TouchableOpacity>
          ) : (
            <>
              {isPaused ? (
                <View style={styles.controlButtons}>
                  <TouchableOpacity style={styles.resumeButton} onPress={resumeTracking}>
                    <Ionicons name="play" size={32} color="#fff" />
                    <Text style={styles.controlButtonText}>Davom</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stopButton} onPress={stopTracking}>
                    <Ionicons name="stop" size={32} color="#fff" />
                    <Text style={styles.controlButtonText}>Tugatish</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.pauseButton} onPress={pauseTracking}>
                  <Ionicons name="pause" size={48} color="#fff" />
                  <Text style={styles.pauseButtonText}>TO'XTATISH</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Tracking Status */}
        {isRunning && (
          <View style={styles.trackingIndicator}>
            <View style={[styles.trackingDot, isPaused && styles.trackingDotPaused]} />
            <Text style={styles.trackingText}>
              {isPaused ? 'To\'xtatildi' : `Kuzatilmoqda... (${route.length} nuqta)`}
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
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
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
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  gpsText: {
    color: '#B8CDE8',
    fontSize: 12,
  },
  mainStatContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  distanceValue: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#4DA6FF',
    lineHeight: 80,
  },
  distanceUnit: {
    fontSize: 20,
    color: '#8BA4C4',
    marginTop: 4,
  },
  speedContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  speedBox: {
    flex: 1,
    alignItems: 'center',
  },
  speedDivider: {
    width: 1,
    backgroundColor: '#2A4A6A',
    marginHorizontal: 12,
  },
  speedValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  speedLabel: {
    fontSize: 14,
    color: '#8BA4C4',
    marginTop: 2,
  },
  speedSubLabel: {
    fontSize: 11,
    color: '#5A7A9A',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#8BA4C4',
    marginTop: 4,
    textAlign: 'center',
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#4DA6FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4DA6FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
  },
  pauseButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#FF9500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 8,
  },
  controlButtons: {
    flexDirection: 'row',
    gap: 20,
  },
  resumeButton: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#4DA6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  trackingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  trackingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4DA6FF',
    marginRight: 8,
  },
  trackingDotPaused: {
    backgroundColor: '#FF9500',
  },
  trackingText: {
    color: '#8BA4C4',
    fontSize: 14,
  },
});
