import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  StatusBar,
  Linking,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Shadows } from '../../theme/theme';
import { useCall } from '../../context/CallContext';
import { useInbox } from '../../context/InboxContext';
import { useProfile } from '../../context/ProfileContext';
import { post } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const ChatDetailScreen = ({ route, navigation }: any) => {
  const { user, conversationId } = route.params;
  const { initiateCall } = useCall();
  const { conversations, updateConversationLocally } = useInbox();
  const { user: currentUser } = useProfile();
  const { showToast } = useToast();

  const conversation = conversations.find(c => (c._id || c.id)?.toString() === conversationId?.toString());
  const myId = (currentUser?.id || (currentUser as any)?._id)?.toString();
  const isMuted = conversation?.mutedBy?.some((id: any) => id.toString() === myId);

  const toggleMute = async () => {
    if (!conversationId) return;
    try {
      const response = await post<any>(`/api/v1/chats/mute/${conversationId}`, {});
      if (response.success) {
        updateConversationLocally(conversationId, { mutedBy: response.data.mutedBy });
        showToast({
          senderName: user.name,
          senderImage: user.profileImage,
          message: response.message,
          conversationId: conversationId,
          contentType: 'text'
        });
      }
    } catch (err) {
      console.error('Mute Error:', err);
      showToast({
        senderName: 'System',
        message: 'Action failed',
        conversationId: conversationId,
        contentType: 'text'
      });
    }
  };

  const options = [
    { id: '1', title: 'Theme', icon: 'color-palette', color: '#6366F1' },
    { id: '2', title: 'Emoji', icon: 'thumbs-up', color: '#6366F1' },
    { id: '3', title: 'Media, Files & Links', icon: 'images', color: '#6B7280' },
    { id: '4', title: 'Search in conversation', icon: 'search', color: '#6B7280' },
  ];

  const privacyOptions = [
    { id: 'p1', title: 'Notifications & Sounds', icon: 'notifications', color: '#6B7280' },
    { id: 'p2', title: 'Block', icon: 'ban', color: '#EF4444' },
    { id: 'p3', title: 'Report', icon: 'alert-circle', color: '#EF4444' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <TouchableOpacity>
          <Icon name="ellipsis-vertical" size={20} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* User Info Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarWrapper}>
            <Image
              source={{ uri: user.profileImage }}
              style={styles.avatar}
            />
            {user.isOnline && <View style={styles.onlineDot} />}
          </View>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userStatus}>
            {user.isOnline ? 'Active Now' : 'Offline'}
          </Text>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => initiateCall(user._id || user.id, 'audio', user.name, user.profileImage)}
            >
              <View style={styles.iconCircle}>
                <Icon name="call" size={22} color="#111827" />
              </View>
              <Text style={styles.actionLabel}>Audio</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => initiateCall(user._id || user.id, 'video', user.name, user.profileImage)}
            >
              <View style={styles.iconCircle}>
                <Icon name="videocam" size={22} color="#111827" />
              </View>
              <Text style={styles.actionLabel}>Video</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => navigation.navigate('Profile', { userId: user._id || user.id })}
            >
              <View style={styles.iconCircle}>
                <Icon name="person" size={22} color="#111827" />
              </View>
              <Text style={styles.actionLabel}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionItem}
              onPress={toggleMute}
            >
              <View style={[styles.iconCircle, isMuted && { backgroundColor: '#FEE2E2' }]}>
                <Icon 
                  name={isMuted ? "notifications-off" : "notifications"} 
                  size={22} 
                  color={isMuted ? "#EF4444" : "#111827"} 
                />
              </View>
              <Text style={[styles.actionLabel, isMuted && { color: '#EF4444' }]}>
                {isMuted ? 'Muted' : 'Mute'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* List Sections */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Customization</Text>
          {options.map((item) => (
            <TouchableOpacity key={item.id} style={styles.listItem}>
              <View style={[styles.listIconBg, { backgroundColor: '#F3F4F6' }]}>
                <Icon name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.listText}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Privacy & Support</Text>
          {privacyOptions.map((item) => (
            <TouchableOpacity key={item.id} style={styles.listItem}>
              <View style={[styles.listIconBg, { backgroundColor: '#F3F4F6' }]}>
                <Icon name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.listText}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 50 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 20,
    paddingBottom: 30,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 15,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10B981',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  userStatus: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '85%',
    marginTop: 30,
  },
  actionItem: {
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  listSection: {
    marginTop: 10,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 15,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  listIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  listText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
});

export default ChatDetailScreen;
