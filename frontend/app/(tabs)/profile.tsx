import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';

const ROUTE_COLORS = [
  { name: 'Ko\'k', color: '#4DA6FF' },
  { name: 'Qizil', color: '#FF6B6B' },
  { name: 'Yashil', color: '#4CAF50' },
  { name: 'Sariq', color: '#FF9500' },
  { name: 'Binafsha', color: '#9C27B0' },
  { name: 'Moviy', color: '#00BCD4' },
  { name: 'Pushti', color: '#E91E63' },
  { name: 'Och yashil', color: '#8BC34A' },
  { name: 'Jigarrang', color: '#795548' },
  { name: 'Kulrang', color: '#607D8B' },
  { name: 'To\'q ko\'k', color: '#3F51B5' },
  { name: 'Oltin', color: '#FFC107' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateUser, changePassword, logout } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [colorModalVisible, setColorModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(user?.route_color || '#4DA6FF');

  const handleUpdateAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Ruxsat kerak', 'Gallereyaga kirish uchun ruxsat bering.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setLoading(true);
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await updateUser({ avatar: base64Image });
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
      Alert.alert('Xato', 'Avatar yangilashda xato.');
    }
  };

  const handleSaveName = async () => {
    if (!name.trim()) {
      Alert.alert('Xato', 'Ism bo\'sh bo\'lishi mumkin emas.');
      return;
    }

    setLoading(true);
    try {
      await updateUser({ name: name.trim() });
      setIsEditing(false);
    } catch (error) {
      Alert.alert('Xato', 'Ismni yangilashda xato.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeColor = async (color: string) => {
    setSelectedColor(color);
    setLoading(true);
    try {
      await updateUser({ route_color: color });
      setColorModalVisible(false);
      Alert.alert('Muvaffaqiyat', 'Chiziq rangi o\'zgartirildi!');
    } catch (error) {
      Alert.alert('Xato', 'Rangni o\'zgartirishda xato.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      Alert.alert('Xato', 'Barcha maydonlarni to\'ldiring.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Xato', 'Yangi parol kamida 6 ta belgi bo\'lishi kerak.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Xato', 'Yangi parollar mos kelmaydi.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPasswordModalVisible(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert('Muvaffaqiyat', 'Parol muvaffaqiyatli o\'zgartirildi.');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Parolni o\'zgartirishda xato.';
      Alert.alert('Xato', message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Chiqish',
      'Hisobdan chiqmoqchimisiz?',
      [
        { text: 'Bekor qilish', style: 'cancel' },
        {
          text: 'Chiqish',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4DA6FF" />
        </View>
      </SafeAreaView>
    );
  }

  const currentColor = user.route_color || selectedColor;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>Mening Profilim</Text>

        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handleUpdateAvatar}>
            {user.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={48} color="#5A7A9A" />
              </View>
            )}
            <View style={[styles.editBadge, { backgroundColor: currentColor }]}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ism</Text>
            {isEditing ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.editInput}
                  value={name}
                  onChangeText={setName}
                  autoFocus
                />
                <TouchableOpacity onPress={handleSaveName} disabled={loading}>
                  <Ionicons name="checkmark" size={24} color="#4DA6FF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setIsEditing(false); setName(user.name); }}>
                  <Ionicons name="close" size={24} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.valueRow}>
                <Text style={styles.infoValue}>{user.name}</Text>
                <TouchableOpacity onPress={() => setIsEditing(true)}>
                  <Ionicons name="pencil" size={20} color="#4DA6FF" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Telefon</Text>
            <Text style={styles.infoValue}>{user.phone}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Jami masofa</Text>
            <Text style={styles.infoValue}>{user.total_distance.toFixed(2)} km</Text>
          </View>
        </View>

        {/* Route Color Selection */}
        <TouchableOpacity
          style={styles.colorButton}
          onPress={() => setColorModalVisible(true)}
        >
          <View style={styles.colorButtonLeft}>
            <View style={[styles.colorPreview, { backgroundColor: currentColor }]} />
            <View>
              <Text style={styles.colorButtonTitle}>Chiziq rangi</Text>
              <Text style={styles.colorButtonSubtitle}>Xaritadagi yo'l rangi</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color="#5A7A9A" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setPasswordModalVisible(true)}
        >
          <Ionicons name="lock-closed" size={24} color="#4DA6FF" />
          <Text style={styles.actionButtonText}>Parolni o'zgartirish</Text>
          <Ionicons name="chevron-forward" size={24} color="#5A7A9A" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out" size={24} color="#FF6B6B" />
          <Text style={styles.logoutButtonText}>Chiqish</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Color Selection Modal */}
      <Modal
        visible={colorModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setColorModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.colorModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chiziq rangini tanlang</Text>
              <TouchableOpacity onPress={() => setColorModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.colorModalSubtitle}>
              Bu rang xaritada sizning yugurish yo'lingizni ko'rsatadi
            </Text>

            <View style={styles.colorGrid}>
              {ROUTE_COLORS.map((item) => (
                <TouchableOpacity
                  key={item.color}
                  style={[
                    styles.colorOption,
                    currentColor === item.color && styles.colorOptionSelected,
                  ]}
                  onPress={() => handleChangeColor(item.color)}
                >
                  <View style={[styles.colorCircle, { backgroundColor: item.color }]}>
                    {currentColor === item.color && (
                      <Ionicons name="checkmark" size={24} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.colorName}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading && (
              <View style={styles.colorLoading}>
                <ActivityIndicator color="#4DA6FF" />
                <Text style={styles.colorLoadingText}>Saqlanmoqda...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Password Modal */}
      <Modal
        visible={passwordModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Parolni o'zgartirish</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Joriy parol"
              placeholderTextColor="#5A7A9A"
              secureTextEntry
              value={oldPassword}
              onChangeText={setOldPassword}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Yangi parol"
              placeholderTextColor="#5A7A9A"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Yangi parolni tasdiqlang"
              placeholderTextColor="#5A7A9A"
              secureTextEntry
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setPasswordModalVisible(false);
                  setOldPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
              >
                <Text style={styles.modalCancelText}>Bekor qilish</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleChangePassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Saqlash</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  scrollContent: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1A3A5C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0F2744',
  },
  infoCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  infoRow: {
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#8BA4C4',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '500',
  },
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editInput: {
    flex: 1,
    backgroundColor: '#0F2744',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A4A6A',
  },
  colorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  colorButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#fff',
  },
  colorButtonTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  colorButtonSubtitle: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  actionButtonText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  logoutButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  colorModalContent: {
    backgroundColor: '#1A3A5C',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  colorModalSubtitle: {
    fontSize: 14,
    color: '#8BA4C4',
    marginBottom: 20,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  colorOption: {
    width: '30%',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#0F2744',
  },
  colorOptionSelected: {
    backgroundColor: '#2A4A6A',
    borderWidth: 2,
    borderColor: '#4DA6FF',
  },
  colorCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  colorName: {
    fontSize: 11,
    color: '#B8CDE8',
    textAlign: 'center',
  },
  colorLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  colorLoadingText: {
    color: '#8BA4C4',
    fontSize: 14,
  },
  modalInput: {
    backgroundColor: '#0F2744',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#2A4A6A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#B8CDE8',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: '#4DA6FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
