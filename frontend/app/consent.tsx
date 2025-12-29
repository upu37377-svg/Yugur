import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

export default function ConsentScreen() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [permissionsGranted, setPermissionsGranted] = useState(false);

  const requestPermissions = async () => {
    try {
      // Request location permission
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (locationStatus !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Location permission is required to track your running routes and territories.',
          [{ text: 'OK' }]
        );
        return false;
      }

      // Request background location (optional for better tracking)
      if (Platform.OS !== 'web') {
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        // Background is optional, continue even if denied
      }

      setPermissionsGranted(true);
      return true;
    } catch (error) {
      console.error('Permission error:', error);
      Alert.alert('Error', 'Failed to request permissions. Please try again.');
      return false;
    }
  };

  const handleContinue = async () => {
    if (!agreed) {
      Alert.alert('Agreement Required', 'Please read and accept the terms to continue.');
      return;
    }

    const granted = await requestPermissions();
    if (!granted) return;

    await AsyncStorage.setItem('consent_accepted', 'true');
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Ionicons name="fitness" size={64} color="#4DA6FF" />
          <Text style={styles.title}>Welcome to Yugur</Text>
          <Text style={styles.subtitle}>Running & Territory App</Text>
        </View>

        <View style={styles.permissionsCard}>
          <Text style={styles.cardTitle}>Required Permissions</Text>
          <View style={styles.permissionItem}>
            <Ionicons name="location" size={24} color="#4DA6FF" />
            <Text style={styles.permissionText}>GPS / Location - To track your running routes</Text>
          </View>
          <View style={styles.permissionItem}>
            <Ionicons name="walk" size={24} color="#4DA6FF" />
            <Text style={styles.permissionText}>Activity Tracking - For fitness monitoring</Text>
          </View>
        </View>

        <View style={styles.termsCard}>
          <Text style={styles.cardTitle}>Terms & Conditions</Text>
          <Text style={styles.termsText}>
            In this application, users can win various cash prizes.{"\n\n"}
            The main purpose of this application is to improve health.{"\n\n"}
            Cash rewards are optional and only available if the user ranks first on the map and leaderboard.{"\n\n"}
            Bonus rewards range from 100,000 to 500,000 UZS.{"\n\n"}
            The app will share the user's phone number with other users.{"\n\n"}
            Other users can see the name and phone number on the map.{"\n\n"}
            This is required because users can sell their territories to others.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setAgreed(!agreed)}
        >
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
          <Text style={styles.checkboxLabel}>
            I have read and agree to the terms and conditions
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.continueButton, !agreed && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={!agreed}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2744',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#8BA4C4',
    marginTop: 8,
  },
  permissionsCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  permissionText: {
    color: '#B8CDE8',
    marginLeft: 12,
    flex: 1,
    fontSize: 14,
  },
  termsCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  termsText: {
    color: '#B8CDE8',
    fontSize: 14,
    lineHeight: 22,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#4DA6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4DA6FF',
  },
  checkboxLabel: {
    color: '#B8CDE8',
    flex: 1,
    fontSize: 14,
  },
  continueButton: {
    backgroundColor: '#4DA6FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: '#2A4A6A',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
