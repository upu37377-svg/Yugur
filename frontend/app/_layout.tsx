import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0F2744' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="consent" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="avatar-setup" />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
