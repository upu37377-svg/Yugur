import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkInitialRoute = async () => {
      if (isLoading) return;
      
      try {
        const consentAccepted = await AsyncStorage.getItem('consent_accepted');
        
        if (!consentAccepted) {
          router.replace('/consent');
        } else if (user) {
          router.replace('/(tabs)/profile');
        } else {
          router.replace('/login');
        }
      } catch (error) {
        console.error('Error checking initial route:', error);
        router.replace('/consent');
      } finally {
        setChecking(false);
      }
    };

    checkInitialRoute();
  }, [isLoading, user]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4DA6FF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F2744',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
