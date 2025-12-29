import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const ADMIN_CODE_KEY = 'admin_code';

interface AdminUser {
  rank: number;
  id: string;
  name: string;
  phone: string;
  avatar: string | null;
  total_distance: number;
  territory_size: { value: number; unit: string };
  runs_count: number;
  restrictions: Array<{ type: string; reason: string; active: boolean }>;
  rewards: Array<{ amount: number; reason: string }>;
  is_admin: boolean;
  created_at: string;
}

interface AdminStats {
  total_users: number;
  total_runs: number;
  total_distance_km: number;
  total_notifications: number;
  restricted_users: number;
  total_rewards_uzs: number;
}

const WARNING_REASONS = [
  "Soxta yugurish faoliyati",
  "GPS manipulyatsiyasi",
  "Ilova qoidalarini buzish",
  "Noto'g'ri hudud xatti-harakati",
  "Boshqa foydalanuvchilarga nisbatan nojo'ya munosabat",
];

export default function AdminScreen() {
  const { user, token } = useAuth();
  const [adminCode, setAdminCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  
  // Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [showRestrictionModal, setShowRestrictionModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  
  // Notification form
  const [notificationType, setNotificationType] = useState<'warning' | 'info' | 'reward'>('warning');
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationReason, setNotificationReason] = useState('');
  const [isBroadcast, setIsBroadcast] = useState(false);
  
  // Reward form
  const [rewardAmount, setRewardAmount] = useState(100000);
  const [rewardReason, setRewardReason] = useState('');
  
  // Restriction form
  const [restrictionType, setRestrictionType] = useState<'run_blocked' | 'map_hidden' | 'suspended'>('run_blocked');
  const [restrictionReason, setRestrictionReason] = useState('');
  
  // Logs
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    checkStoredAdminCode();
  }, []);

  const checkStoredAdminCode = async () => {
    try {
      const storedCode = await AsyncStorage.getItem(ADMIN_CODE_KEY);
      if (storedCode) {
        setAdminCode(storedCode);
        await verifyAdminCode(storedCode);
      } else {
        setLoading(false);
      }
    } catch (e) {
      setLoading(false);
    }
  };

  const verifyAdminCode = async (code: string) => {
    setVerifying(true);
    try {
      const response = await axios.post(`${API_URL}/api/admin/verify`, {
        admin_code: code
      });
      
      if (response.data.valid) {
        setIsVerified(true);
        await AsyncStorage.setItem(ADMIN_CODE_KEY, code);
        await loadData(code);
      }
    } catch (error: any) {
      Alert.alert('Xato', 'Noto\'g\'ri admin kodi');
      setIsVerified(false);
    } finally {
      setVerifying(false);
      setLoading(false);
    }
  };

  const loadData = async (code?: string) => {
    const adminCodeToUse = code || adminCode;
    if (!token || !adminCodeToUse) return;
    
    try {
      const [usersRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/users?token=${token}&admin_code=${adminCodeToUse}`),
        axios.get(`${API_URL}/api/admin/stats?token=${token}&admin_code=${adminCodeToUse}`)
      ]);
      
      setUsers(usersRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadLogs = async () => {
    if (!token || !adminCode) return;
    
    try {
      const response = await axios.get(`${API_URL}/api/admin/logs?token=${token}&admin_code=${adminCode}&limit=50`);
      setLogs(response.data);
      setShowLogsModal(true);
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(ADMIN_CODE_KEY);
    setIsVerified(false);
    setAdminCode('');
  };

  const sendNotification = async () => {
    if (!notificationTitle || !notificationMessage) {
      Alert.alert('Xato', 'Sarlavha va xabar to\'ldiring');
      return;
    }
    
    try {
      await axios.post(`${API_URL}/api/admin/notification?token=${token}&admin_code=${adminCode}`, {
        user_id: isBroadcast ? null : selectedUser?.id,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        reason: notificationReason || null
      });
      
      Alert.alert('Muvaffaqiyat', 'Xabar yuborildi');
      setShowNotificationModal(false);
      resetNotificationForm();
      loadData();
    } catch (error) {
      Alert.alert('Xato', 'Xabar yuborishda xatolik');
    }
  };

  const assignReward = async () => {
    if (!selectedUser || !rewardReason) {
      Alert.alert('Xato', 'Sababni kiriting');
      return;
    }
    
    try {
      await axios.post(`${API_URL}/api/admin/reward?token=${token}&admin_code=${adminCode}`, {
        user_id: selectedUser.id,
        amount: rewardAmount,
        reason: rewardReason
      });
      
      Alert.alert('Muvaffaqiyat', `${rewardAmount.toLocaleString()} UZS mukofot berildi`);
      setShowRewardModal(false);
      resetRewardForm();
      loadData();
    } catch (error) {
      Alert.alert('Xato', 'Mukofot berishda xatolik');
    }
  };

  const applyRestriction = async () => {
    if (!selectedUser || !restrictionReason) {
      Alert.alert('Xato', 'Sababni kiriting');
      return;
    }
    
    try {
      await axios.post(`${API_URL}/api/admin/restrict?token=${token}&admin_code=${adminCode}`, {
        user_id: selectedUser.id,
        restriction_type: restrictionType,
        reason: restrictionReason
      });
      
      Alert.alert('Muvaffaqiyat', 'Cheklov qo\'yildi');
      setShowRestrictionModal(false);
      setShowUserModal(false);
      resetRestrictionForm();
      loadData();
    } catch (error) {
      Alert.alert('Xato', 'Cheklov qo\'yishda xatolik');
    }
  };

  const removeRestriction = async (restrictionType: string) => {
    if (!selectedUser) return;
    
    try {
      await axios.post(`${API_URL}/api/admin/unrestrict?token=${token}&admin_code=${adminCode}`, {
        user_id: selectedUser.id,
        restriction_type: restrictionType
      });
      
      Alert.alert('Muvaffaqiyat', 'Cheklov olib tashlandi');
      loadData();
      setShowUserModal(false);
    } catch (error) {
      Alert.alert('Xato', 'Cheklovni olib tashlashda xatolik');
    }
  };

  const resetNotificationForm = () => {
    setNotificationType('warning');
    setNotificationTitle('');
    setNotificationMessage('');
    setNotificationReason('');
    setIsBroadcast(false);
  };

  const resetRewardForm = () => {
    setRewardAmount(100000);
    setRewardReason('');
  };

  const resetRestrictionForm = () => {
    setRestrictionType('run_blocked');
    setRestrictionReason('');
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.phone.includes(searchQuery)
  );

  // Admin code entry screen
  if (!isVerified) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.codeEntry}>
          <Ionicons name="shield-checkmark" size={80} color="#4DA6FF" />
          <Text style={styles.codeTitle}>Admin Panel</Text>
          <Text style={styles.codeSubtitle}>Kirish uchun admin kodini kiriting</Text>
          
          <TextInput
            style={styles.codeInput}
            placeholder="Admin kodi"
            placeholderTextColor="#5A7A9A"
            value={adminCode}
            onChangeText={setAdminCode}
            secureTextEntry
            autoCapitalize="none"
          />
          
          <TouchableOpacity 
            style={styles.verifyButton}
            onPress={() => verifyAdminCode(adminCode)}
            disabled={verifying || !adminCode}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.verifyButtonText}>Kirish</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4DA6FF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4DA6FF" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Admin Panel</Text>
            <Text style={styles.headerSubtitle}>Boshqaruv paneli</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.headerButton} onPress={loadLogs}>
              <Ionicons name="list" size={20} color="#4DA6FF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton} onPress={handleLogout}>
              <Ionicons name="log-out" size={20} color="#FF6B6B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="people" size={24} color="#4DA6FF" />
              <Text style={styles.statValue}>{stats.total_users}</Text>
              <Text style={styles.statLabel}>Foydalanuvchilar</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="fitness" size={24} color="#4CAF50" />
              <Text style={styles.statValue}>{stats.total_runs}</Text>
              <Text style={styles.statLabel}>Yugurishlar</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="map" size={24} color="#FF9500" />
              <Text style={styles.statValue}>{stats.total_distance_km}</Text>
              <Text style={styles.statLabel}>Jami km</Text>
            </View>
            <View style={styles.statCard}>
              <Ionicons name="warning" size={24} color="#FF6B6B" />
              <Text style={styles.statValue}>{stats.restricted_users}</Text>
              <Text style={styles.statLabel}>Cheklangan</Text>
            </View>
          </View>
        )}

        {/* Broadcast Notification */}
        <TouchableOpacity 
          style={styles.broadcastButton}
          onPress={() => {
            setIsBroadcast(true);
            setSelectedUser(null);
            setShowNotificationModal(true);
          }}
        >
          <Ionicons name="megaphone" size={20} color="#fff" />
          <Text style={styles.broadcastButtonText}>Umumiy xabar yuborish</Text>
        </TouchableOpacity>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#5A7A9A" />
          <TextInput
            style={styles.searchInput}
            placeholder="Ism yoki telefon qidirish..."
            placeholderTextColor="#5A7A9A"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Users List */}
        <Text style={styles.sectionTitle}>
          Foydalanuvchilar ({filteredUsers.length})
        </Text>

        {filteredUsers.map((u) => (
          <TouchableOpacity 
            key={u.id} 
            style={styles.userCard}
            onPress={() => {
              setSelectedUser(u);
              setShowUserModal(true);
            }}
          >
            <View style={styles.userRank}>
              <Text style={styles.userRankText}>#{u.rank}</Text>
            </View>
            
            <View style={styles.userMain}>
              {u.avatar ? (
                <Image source={{ uri: u.avatar }} style={styles.userAvatar} />
              ) : (
                <View style={styles.userAvatarPlaceholder}>
                  <Ionicons name="person" size={18} color="#5A7A9A" />
                </View>
              )}
              
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <Text style={styles.userName}>{u.name}</Text>
                  {u.is_admin && (
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                  {u.restrictions.some(r => r.active) && (
                    <Ionicons name="warning" size={16} color="#FF6B6B" style={{ marginLeft: 4 }} />
                  )}
                </View>
                <Text style={styles.userPhone}>{u.phone}</Text>
              </View>
            </View>

            <View style={styles.userStats}>
              <Text style={styles.userDistance}>{u.total_distance.toFixed(2)} km</Text>
              <Text style={styles.userTerritory}>{u.territory_size.value} {u.territory_size.unit}</Text>
            </View>

            <View style={styles.userActions}>
              <TouchableOpacity 
                style={styles.actionBtn}
                onPress={() => {
                  setSelectedUser(u);
                  setIsBroadcast(false);
                  setShowNotificationModal(true);
                }}
              >
                <Ionicons name="notifications" size={18} color="#4DA6FF" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.actionBtn}
                onPress={() => {
                  setSelectedUser(u);
                  setShowRewardModal(true);
                }}
              >
                <Ionicons name="gift" size={18} color="#4CAF50" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* User Detail Modal */}
      <Modal visible={showUserModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Foydalanuvchi ma'lumoti</Text>
              <TouchableOpacity onPress={() => setShowUserModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {selectedUser && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.userDetailHeader}>
                  {selectedUser.avatar ? (
                    <Image source={{ uri: selectedUser.avatar }} style={styles.detailAvatar} />
                  ) : (
                    <View style={styles.detailAvatarPlaceholder}>
                      <Ionicons name="person" size={32} color="#5A7A9A" />
                    </View>
                  )}
                  <Text style={styles.detailName}>{selectedUser.name}</Text>
                  <Text style={styles.detailPhone}>{selectedUser.phone}</Text>
                </View>

                <View style={styles.detailStats}>
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>#{selectedUser.rank}</Text>
                    <Text style={styles.detailStatLabel}>Reyting</Text>
                  </View>
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{selectedUser.total_distance.toFixed(2)}</Text>
                    <Text style={styles.detailStatLabel}>km</Text>
                  </View>
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{selectedUser.territory_size.value}</Text>
                    <Text style={styles.detailStatLabel}>{selectedUser.territory_size.unit}</Text>
                  </View>
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{selectedUser.runs_count}</Text>
                    <Text style={styles.detailStatLabel}>Yugurish</Text>
                  </View>
                </View>

                {/* Restrictions */}
                {selectedUser.restrictions.filter(r => r.active).length > 0 && (
                  <View style={styles.restrictionsSection}>
                    <Text style={styles.sectionLabel}>Faol cheklovlar:</Text>
                    {selectedUser.restrictions.filter(r => r.active).map((r, i) => (
                      <View key={i} style={styles.restrictionItem}>
                        <Ionicons name="ban" size={16} color="#FF6B6B" />
                        <Text style={styles.restrictionText}>{r.type}: {r.reason}</Text>
                        <TouchableOpacity onPress={() => removeRestriction(r.type)}>
                          <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Rewards */}
                {selectedUser.rewards.length > 0 && (
                  <View style={styles.rewardsSection}>
                    <Text style={styles.sectionLabel}>Mukofotlar:</Text>
                    {selectedUser.rewards.map((r, i) => (
                      <View key={i} style={styles.rewardItem}>
                        <Ionicons name="gift" size={16} color="#4CAF50" />
                        <Text style={styles.rewardText}>{r.amount.toLocaleString()} UZS - {r.reason}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Action buttons */}
                <View style={styles.detailActions}>
                  <TouchableOpacity 
                    style={[styles.detailAction, { backgroundColor: '#4DA6FF' }]}
                    onPress={() => {
                      setIsBroadcast(false);
                      setShowNotificationModal(true);
                    }}
                  >
                    <Ionicons name="notifications" size={20} color="#fff" />
                    <Text style={styles.detailActionText}>Xabar yuborish</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.detailAction, { backgroundColor: '#4CAF50' }]}
                    onPress={() => setShowRewardModal(true)}
                  >
                    <Ionicons name="gift" size={20} color="#fff" />
                    <Text style={styles.detailActionText}>Mukofot berish</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.detailAction, { backgroundColor: '#FF6B6B' }]}
                    onPress={() => setShowRestrictionModal(true)}
                  >
                    <Ionicons name="ban" size={20} color="#fff" />
                    <Text style={styles.detailActionText}>Cheklov qo'yish</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Notification Modal */}
      <Modal visible={showNotificationModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isBroadcast ? 'Umumiy xabar' : `${selectedUser?.name}ga xabar`}
              </Text>
              <TouchableOpacity onPress={() => { setShowNotificationModal(false); resetNotificationForm(); }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Xabar turi:</Text>
              <View style={styles.typeButtons}>
                {(['warning', 'info', 'reward'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      notificationType === type && styles.typeButtonActive,
                      { backgroundColor: type === 'warning' ? '#FF6B6B33' : type === 'info' ? '#4DA6FF33' : '#4CAF5033' }
                    ]}
                    onPress={() => setNotificationType(type)}
                  >
                    <Ionicons 
                      name={type === 'warning' ? 'warning' : type === 'info' ? 'information-circle' : 'gift'} 
                      size={20} 
                      color={type === 'warning' ? '#FF6B6B' : type === 'info' ? '#4DA6FF' : '#4CAF50'} 
                    />
                    <Text style={[styles.typeButtonText, { color: type === 'warning' ? '#FF6B6B' : type === 'info' ? '#4DA6FF' : '#4CAF50' }]}>
                      {type === 'warning' ? 'Ogohlantirish' : type === 'info' ? 'Ma\'lumot' : 'Mukofot'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Sarlavha:</Text>
              <TextInput
                style={styles.input}
                value={notificationTitle}
                onChangeText={setNotificationTitle}
                placeholder="Xabar sarlavhasi"
                placeholderTextColor="#5A7A9A"
              />

              <Text style={styles.inputLabel}>Xabar matni:</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notificationMessage}
                onChangeText={setNotificationMessage}
                placeholder="Xabar matni"
                placeholderTextColor="#5A7A9A"
                multiline
                numberOfLines={4}
              />

              {notificationType === 'warning' && (
                <>
                  <Text style={styles.inputLabel}>Sabab:</Text>
                  <View style={styles.reasonButtons}>
                    {WARNING_REASONS.map((reason, i) => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.reasonButton, notificationReason === reason && styles.reasonButtonActive]}
                        onPress={() => setNotificationReason(reason)}
                      >
                        <Text style={[styles.reasonButtonText, notificationReason === reason && styles.reasonButtonTextActive]}>
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TouchableOpacity style={styles.submitButton} onPress={sendNotification}>
                <Text style={styles.submitButtonText}>Yuborish</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Reward Modal */}
      <Modal visible={showRewardModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedUser?.name}ga mukofot</Text>
              <TouchableOpacity onPress={() => { setShowRewardModal(false); resetRewardForm(); }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Mukofot miqdori:</Text>
              <View style={styles.amountButtons}>
                {[100000, 200000, 500000].map(amount => (
                  <TouchableOpacity
                    key={amount}
                    style={[styles.amountButton, rewardAmount === amount && styles.amountButtonActive]}
                    onPress={() => setRewardAmount(amount)}
                  >
                    <Text style={[styles.amountButtonText, rewardAmount === amount && styles.amountButtonTextActive]}>
                      {amount.toLocaleString()} UZS
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Sabab:</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={rewardReason}
                onChangeText={setRewardReason}
                placeholder="Mukofot sababi"
                placeholderTextColor="#5A7A9A"
                multiline
              />

              <TouchableOpacity style={[styles.submitButton, { backgroundColor: '#4CAF50' }]} onPress={assignReward}>
                <Text style={styles.submitButtonText}>Mukofot berish</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Restriction Modal */}
      <Modal visible={showRestrictionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedUser?.name}ga cheklov</Text>
              <TouchableOpacity onPress={() => { setShowRestrictionModal(false); resetRestrictionForm(); }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Cheklov turi:</Text>
              <View style={styles.restrictionButtons}>
                {([
                  { type: 'run_blocked', label: 'Yugurishni bloklash', icon: 'fitness' },
                  { type: 'map_hidden', label: 'Xaritadan yashirish', icon: 'map' },
                  { type: 'suspended', label: 'Hisobni to\'xtatish', icon: 'person-remove' },
                ] as const).map(item => (
                  <TouchableOpacity
                    key={item.type}
                    style={[styles.restrictionButton, restrictionType === item.type && styles.restrictionButtonActive]}
                    onPress={() => setRestrictionType(item.type)}
                  >
                    <Ionicons name={item.icon as any} size={20} color={restrictionType === item.type ? '#fff' : '#FF6B6B'} />
                    <Text style={[styles.restrictionButtonText, restrictionType === item.type && { color: '#fff' }]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Sabab:</Text>
              <View style={styles.reasonButtons}>
                {WARNING_REASONS.map((reason, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.reasonButton, restrictionReason === reason && styles.reasonButtonActive]}
                    onPress={() => setRestrictionReason(reason)}
                  >
                    <Text style={[styles.reasonButtonText, restrictionReason === reason && styles.reasonButtonTextActive]}>
                      {reason}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={[styles.submitButton, { backgroundColor: '#FF6B6B' }]} onPress={applyRestriction}>
                <Text style={styles.submitButtonText}>Cheklov qo'yish</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logs Modal */}
      <Modal visible={showLogsModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Admin loglari</Text>
              <TouchableOpacity onPress={() => setShowLogsModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {logs.map((log, i) => (
                <View key={i} style={styles.logItem}>
                  <View style={styles.logHeader}>
                    <Ionicons 
                      name={
                        log.action_type === 'reward_assigned' ? 'gift' :
                        log.action_type === 'restriction_applied' ? 'ban' :
                        log.action_type === 'notification_sent' ? 'notifications' : 'document'
                      } 
                      size={16} 
                      color="#4DA6FF" 
                    />
                    <Text style={styles.logType}>{log.action_type}</Text>
                    <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleString()}</Text>
                  </View>
                  {log.details && (
                    <Text style={styles.logDetails}>
                      {JSON.stringify(log.details, null, 2)}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
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
  codeEntry: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  codeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
  },
  codeSubtitle: {
    fontSize: 16,
    color: '#8BA4C4',
    marginTop: 8,
    marginBottom: 30,
  },
  codeInput: {
    width: '100%',
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
  },
  verifyButton: {
    backgroundColor: '#4DA6FF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginTop: 20,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8BA4C4',
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  headerButton: {
    backgroundColor: '#1A3A5C',
    padding: 10,
    borderRadius: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#8BA4C4',
    marginTop: 4,
  },
  broadcastButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4DA6FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  broadcastButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  userCard: {
    backgroundColor: '#1A3A5C',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userRank: {
    backgroundColor: '#4DA6FF',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userRankText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  userMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A4A6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 10,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  adminBadge: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  adminBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
  },
  userPhone: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 2,
  },
  userStats: {
    alignItems: 'flex-end',
    marginRight: 10,
  },
  userDistance: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4DA6FF',
  },
  userTerritory: {
    fontSize: 10,
    color: '#8BA4C4',
  },
  userActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    backgroundColor: '#0F2744',
    padding: 8,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A3A5C',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2A4A6A',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 20,
  },
  userDetailHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  detailAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  detailAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2A4A6A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
  },
  detailPhone: {
    fontSize: 16,
    color: '#8BA4C4',
    marginTop: 4,
  },
  detailStats: {
    flexDirection: 'row',
    backgroundColor: '#0F2744',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  detailStat: {
    flex: 1,
    alignItems: 'center',
  },
  detailStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4DA6FF',
  },
  detailStatLabel: {
    fontSize: 12,
    color: '#8BA4C4',
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8BA4C4',
    marginBottom: 10,
  },
  restrictionsSection: {
    marginBottom: 16,
  },
  restrictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B6B22',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  restrictionText: {
    flex: 1,
    color: '#FF6B6B',
    fontSize: 13,
  },
  rewardsSection: {
    marginBottom: 16,
  },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF5022',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
  },
  rewardText: {
    flex: 1,
    color: '#4CAF50',
    fontSize: 13,
  },
  detailActions: {
    gap: 10,
  },
  detailAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  detailActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8BA4C4',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#0F2744',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#fff',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    gap: 6,
  },
  typeButtonActive: {
    borderWidth: 2,
    borderColor: '#4DA6FF',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reasonButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonButton: {
    backgroundColor: '#0F2744',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reasonButtonActive: {
    backgroundColor: '#4DA6FF',
  },
  reasonButtonText: {
    color: '#8BA4C4',
    fontSize: 12,
  },
  reasonButtonTextActive: {
    color: '#fff',
  },
  amountButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  amountButton: {
    flex: 1,
    backgroundColor: '#0F2744',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  amountButtonActive: {
    backgroundColor: '#4CAF50',
  },
  amountButtonText: {
    color: '#8BA4C4',
    fontSize: 14,
    fontWeight: '600',
  },
  amountButtonTextActive: {
    color: '#fff',
  },
  restrictionButtons: {
    gap: 10,
  },
  restrictionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B6B22',
    padding: 14,
    borderRadius: 10,
    gap: 10,
  },
  restrictionButtonActive: {
    backgroundColor: '#FF6B6B',
  },
  restrictionButtonText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#4DA6FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 20,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  logItem: {
    backgroundColor: '#0F2744',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logType: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  logTime: {
    color: '#5A7A9A',
    fontSize: 11,
  },
  logDetails: {
    color: '#8BA4C4',
    fontSize: 11,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
