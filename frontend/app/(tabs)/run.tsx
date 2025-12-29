import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
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
}

export default function RunScreen() {
  const { token, refreshUser } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [distance, setDistance] = useState(0); // in km
  const [duration, setDuration] = useState(0); // in seconds
  const [route, setRoute] = useState<LocationPoint[]>([]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocation = useRef<LocationPoint | null>(null);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  const startTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is required to track your run.');
        return;
      }

      setIsRunning(true);
      setIsPaused(false);
      setDistance(0);
      setDuration(0);
      setRoute([]);
      setStartTime(new Date());
      lastLocation.current = null;

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);

      // Start location tracking
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (location) => {
          const newPoint: LocationPoint = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            timestamp: Date.now(),
          };

          setRoute(prev => {
            const newRoute = [...prev, newPoint];
            
            // Calculate distance
            if (lastLocation.current) {
              const dist = calculateDistance(
                lastLocation.current.lat,
                lastLocation.current.lng,
                newPoint.lat,
                newPoint.lng
              );
              setDistance(d => d + dist);
            }
            
            lastLocation.current = newPoint;
            return newRoute;
          });
        }
      );
    } catch (error) {
      console.error('Error starting tracking:', error);
      Alert.alert('Error', 'Failed to start tracking. Please try again.');
    }
  };

  const pauseTracking = () => {
    setIsPaused(true);
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
    setIsPaused(false);
    
    // Resume timer
    timerRef.current = setInterval(() => {
      setDuration(d => d + 1);
    }, 1000);

    // Resume location tracking
    locationSubscription.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 5,
      },
      (location) => {
        const newPoint: LocationPoint = {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
          timestamp: Date.now(),
        };

        setRoute(prev => {
          const newRoute = [...prev, newPoint];
          
          if (lastLocation.current) {
            const dist = calculateDistance(
              lastLocation.current.lat,
              lastLocation.current.lng,
              newPoint.lat,
              newPoint.lng
            );
            setDistance(d => d + dist);
          }
          
          lastLocation.current = newPoint;
          return newRoute;
        });
      }
    );
  };

  const stopTracking = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    // Save run if we have data
    if (isRunning && route.length > 0 && startTime && token) {
      try {
        await axios.post(`${API_URL}/api/runs?token=${token}`, {
          route: route,
          distance: distance,
          duration: duration,
          start_time: startTime.toISOString(),
          end_time: new Date().toISOString(),
        });
        await refreshUser();
        Alert.alert(
          'Run Saved',
          `Great job! You ran ${distance.toFixed(2)} km in ${formatDuration(duration)}.`
        );
      } catch (error) {
        console.error('Error saving run:', error);
        Alert.alert('Error', 'Failed to save your run. Please try again.');
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    setDistance(0);
    setDuration(0);
    setRoute([]);
    setStartTime(null);
    lastLocation.current = null;
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371; // Earth's radius in km
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

  const formatDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculatePace = (): string => {
    if (distance <= 0) return '--:--';
    const paceSeconds = duration / distance; // seconds per km
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.headerTitle}>Start Run</Text>

        <View style={styles.statsContainer}>
          <View style={styles.mainStat}>
            <Text style={styles.mainStatValue}>{distance.toFixed(2)}</Text>
            <Text style={styles.mainStatLabel}>kilometers</Text>
          </View>

          <View style={styles.secondaryStats}>
            <View style={styles.statItem}>
              <Ionicons name="time" size={24} color="#4DA6FF" />
              <Text style={styles.statValue}>{formatDuration(duration)}</Text>
              <Text style={styles.statLabel}>Duration</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="speedometer" size={24} color="#4DA6FF" />
              <Text style={styles.statValue}>{calculatePace()}</Text>
              <Text style={styles.statLabel}>Pace (min/km)</Text>
            </View>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          {!isRunning ? (
            <TouchableOpacity style={styles.startButton} onPress={startTracking}>
              <Ionicons name="play" size={48} color="#fff" />
              <Text style={styles.startButtonText}>START RUN</Text>
            </TouchableOpacity>
          ) : (
            <>
              {isPaused ? (
                <View style={styles.controlButtons}>
                  <TouchableOpacity style={styles.resumeButton} onPress={resumeTracking}>
                    <Ionicons name="play" size={32} color="#fff" />
                    <Text style={styles.controlButtonText}>Resume</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stopButton} onPress={stopTracking}>
                    <Ionicons name="stop" size={32} color="#fff" />
                    <Text style={styles.controlButtonText}>Finish</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.pauseButton} onPress={pauseTracking}>
                  <Ionicons name="pause" size={48} color="#fff" />
                  <Text style={styles.pauseButtonText}>PAUSE RUN</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {isRunning && (
          <View style={styles.trackingIndicator}>
            <View style={[styles.trackingDot, isPaused && styles.trackingDotPaused]} />
            <Text style={styles.trackingText}>
              {isPaused ? 'Run Paused' : 'Tracking your run...'}
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
    padding: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  statsContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  mainStat: {
    alignItems: 'center',
    marginBottom: 32,
  },
  mainStatValue: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#4DA6FF',
  },
  mainStatLabel: {
    fontSize: 18,
    color: '#8BA4C4',
    marginTop: 8,
  },
  secondaryStats: {
    flexDirection: 'row',
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#2A4A6A',
    marginHorizontal: 16,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 4,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
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
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
  },
  pauseButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FF9500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
  },
  controlButtons: {
    flexDirection: 'row',
    gap: 24,
  },
  resumeButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4DA6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
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
    marginTop: 24,
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
