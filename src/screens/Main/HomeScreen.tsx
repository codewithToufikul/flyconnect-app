import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  RefreshControl,
  Modal,
  Alert,
  TouchableWithoutFeedback,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { Shadows } from '../../theme/theme';
import { useProfile } from '../../context/ProfileContext';
import { useSocket } from '../../context/SocketContext';
import { useInbox } from '../../context/InboxContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { DeviceEventEmitter } from 'react-native';
import { get, clearChatAPI, deleteConversationAPI, blockUserAPI, unblockUserAPI } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }: any) => {
  const { user: currentUser, refreshProfile } = useProfile();
  const {
    conversations,
    refreshInbox,
    deleteConversationLocally,
    clearChatLocally,
  } = useInbox();
  const { colors, isDark } = useTheme();
  const { showToast } = useToast();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'social'>('personal');

  // Long press action modal state
  const [selectedChat, setSelectedChat] = useState<{ conv: any; participant: any } | null>(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshInbox();
    setRefreshing(false);
  }, [refreshInbox]);

  const { isConnected } = useSocket();

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('NAVIGATE_TO_CHAT', async ({ userId, canCall }) => {
      console.log('🚀 [Home] Received direct navigation request for user:', userId, 'canCall:', canCall);
      try {
        const response = await get<any>(`/api/v1/users/${userId}`);
        const targetUser = response?.user || { _id: userId, name: 'User' };
        navigation.navigate('ChatScreen', { user: targetUser, canCall });
      } catch (err) {
        console.error('❌ [Home] Failed to fetch target user for nav:', err);
        navigation.navigate('ChatScreen', { user: { _id: userId, name: 'User' }, canCall });
      }
    });

    const checkPending = async () => {
      try {
        const pending = await AsyncStorage.getItem('@pending_nav_target');
        if (pending && pending.includes('chat:')) {
          const userId = pending.split(':')[1];
          const canCallStr = await AsyncStorage.getItem('@pending_nav_can_call');
          const canCall = canCallStr === 'true' ? true : (canCallStr === 'false' ? false : undefined);

          await AsyncStorage.removeItem('@pending_nav_target');
          await AsyncStorage.removeItem('@pending_nav_can_call');
          DeviceEventEmitter.emit('NAVIGATE_TO_CHAT', { userId, canCall });
        }
      } catch (e) {
        console.log('Error checking pending nav:', e);
      }
    };
    checkPending();

    return () => sub.remove();
  }, [navigation]);

  const filteredConversations = conversations.filter(conv => {
    if (activeTab === 'social') return conv.category === 'social_response';
    return !conv.category || conv.category === 'normal';
  });

  const handleLongPress = (conv: any, participant: any) => {
    setSelectedChat({ conv, participant });
    setActionModalVisible(true);
  };

  const handleClearChat = async () => {
    if (!selectedChat) return;
    const cid = selectedChat.conv._id || selectedChat.conv.id;
    setActionModalVisible(false);

    Alert.alert(
      'Clear Chat',
      'Are you sure you want to clear all messages from this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              clearChatLocally(cid);
              await clearChatAPI(cid);
              showToast({
                senderName: 'Chat Cleared',
                message: 'All messages have been cleared from this chat.',
              });
            } catch (err) {
              console.error('Failed to clear chat:', err);
            }
          },
        },
      ]
    );
  };

  const handleDeleteConversation = async () => {
    if (!selectedChat) return;
    const cid = selectedChat.conv._id || selectedChat.conv.id;
    setActionModalVisible(false);

    Alert.alert(
      'Delete Conversation',
      'This will delete the entire conversation from your inbox.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              deleteConversationLocally(cid);
              await deleteConversationAPI(cid);
              showToast({
                senderName: 'Conversation Deleted',
                message: 'The chat has been removed from your list.',
              });
            } catch (err) {
              console.error('Failed to delete conversation:', err);
            }
          },
        },
      ]
    );
  };

  const handleToggleBlockUser = async () => {
    if (!selectedChat) return;
    const targetUserId = selectedChat.participant._id || selectedChat.participant.id;
    const targetUserName = selectedChat.participant.name || 'User';
    const isCurrentlyBlocked = currentUser?.blockedUsers?.some(
      (id: any) => id?.toString() === targetUserId?.toString()
    );
    setActionModalVisible(false);

    Alert.alert(
      isCurrentlyBlocked ? 'Unblock User' : 'Block User',
      isCurrentlyBlocked
        ? `Are you sure you want to unblock ${targetUserName}?`
        : `Are you sure you want to block ${targetUserName}? They won't be able to message or call you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isCurrentlyBlocked ? 'Unblock' : 'Block',
          style: isCurrentlyBlocked ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (isCurrentlyBlocked) {
                await unblockUserAPI(targetUserId);
                showToast({
                  senderName: 'User Unblocked',
                  message: `${targetUserName} has been unblocked.`,
                });
              } else {
                await blockUserAPI(targetUserId);
                showToast({
                  senderName: 'User Blocked',
                  message: `${targetUserName} has been blocked.`,
                });
              }
              await refreshProfile();
            } catch (err) {
              console.error('Failed to toggle block:', err);
            }
          },
        },
      ]
    );
  };

  const renderRecentActivity = () => {
    if (filteredConversations.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Icon name="chatbubbles-outline" size={80} color={isDark ? '#334155' : '#E2E8F0'} />
          <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
            Your conversations will appear here
          </Text>
        </View>
      );
    }

    return filteredConversations.map(conv => {
      const currentUserId = currentUser?.id || (currentUser as any)?._id;
      const myIdStr = currentUserId?.toString();

      const otherParticipant = conv.participants.find((p: any) => {
        const pId = (p._id || p.id)?.toString();
        return pId && myIdStr && pId !== myIdStr;
      });

      if (!otherParticipant) return null;

      let unreadCount = 0;
      if (conv.unreadCount && myIdStr) {
        if (typeof conv.unreadCount === 'object') {
          unreadCount = Number(conv.unreadCount[myIdStr]) || 0;
        } else if (typeof conv.unreadCount === 'number') {
          unreadCount = conv.unreadCount;
        }
      }

      return (
        <TouchableOpacity
          key={conv._id || conv.id}
          style={[styles.chatItem, { borderBottomColor: colors.border }]}
          onPress={() => navigation.navigate('ChatScreen', { user: otherParticipant })}
          onLongPress={() => handleLongPress(conv, otherParticipant)}
          delayLongPress={350}
        >
          <View style={styles.avatarContainer}>
            <Image source={{ uri: otherParticipant.profileImage }} style={styles.chatAvatar} />
            {otherParticipant.isOnline && <View style={styles.onlineIndicator} />}
          </View>
          <View style={styles.chatInfo}>
            <View style={styles.chatHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.chatName, { color: colors.text }]}>{otherParticipant.name}</Text>
                {conv.mutedBy?.some((id: any) => id.toString() === myIdStr) && (
                  <Icon name="notifications-off" size={12} color="#9CA3AF" style={{ marginLeft: 4 }} />
                )}
              </View>
              {conv.lastMessage && (
                <Text style={styles.chatTime}>
                  {(() => {
                    try {
                      const d = new Date(conv.lastMessageAt || conv.lastMessage.createdAt);
                      if (isNaN(d.getTime())) return '';
                      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                    } catch {
                      return '';
                    }
                  })()}
                </Text>
              )}
            </View>
            <View style={styles.chatFooterRow}>
              <Text
                style={[
                  styles.chatLastMsg,
                  { color: colors.textSecondary },
                  unreadCount > 0 && [styles.unreadLastMsg, { color: colors.text }],
                  conv.lastMessage?.contentType === 'call_log' &&
                    conv.lastMessage?.content?.includes('MISSED') && { color: colors.error },
                ]}
                numberOfLines={1}
              >
                {conv.lastMessage?.contentType === 'image' ? (
                  <View style={styles.msgRow}>
                    <Icon name="camera-outline" size={16} color="#6B7280" />
                    <Text style={styles.inlineMsg}> Image</Text>
                  </View>
                ) : conv.lastMessage?.contentType === 'video' ? (
                  <View style={styles.msgRow}>
                    <Icon name="videocam-outline" size={16} color="#6B7280" />
                    <Text style={styles.inlineMsg}> Video</Text>
                  </View>
                ) : conv.lastMessage?.contentType === 'file' ? (
                  <View style={styles.msgRow}>
                    <Icon name="document-outline" size={16} color="#6B7280" />
                    <Text style={styles.inlineMsg}> File</Text>
                  </View>
                ) : conv.lastMessage?.contentType === 'call_log' ? (
                  <View style={styles.msgRow}>
                    <Icon
                      name={
                        conv.lastMessage?.metadata?.callType === 'video'
                          ? 'videocam'
                          : 'call'
                      }
                      size={14}
                      color={
                        conv.lastMessage?.metadata?.callStatus === 'MISSED'
                          ? colors.error
                          : '#6B7280'
                      }
                    />
                    <Text
                      style={[
                        styles.inlineMsg,
                        conv.lastMessage?.metadata?.callStatus === 'MISSED' && {
                          color: colors.error,
                        },
                      ]}
                    >
                      {conv.lastMessage?.metadata?.callerId?.toString() === myIdStr ? (
                        <Icon name="arrow-up-outline" size={10} />
                      ) : (
                        <Icon name="arrow-down-outline" size={10} />
                      )}
                      {` ${conv.lastMessage?.content}`}
                    </Text>
                  </View>
                ) : (
                  conv.lastMessage?.content || 'Started a conversation'
                )}
              </Text>
              <View style={styles.statusIndicatorContainer}>
                {unreadCount > 0 ? (
                  <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.unreadCountText}>{unreadCount}</Text>
                  </View>
                ) : (
                  conv.lastMessage &&
                  (typeof conv.lastMessage.senderId === 'object'
                    ? conv.lastMessage.senderId._id
                    : conv.lastMessage.senderId)?.toString() === myIdStr &&
                  (conv.lastMessage.status === 'read' ? (
                    <Image
                      source={{ uri: otherParticipant.profileImage }}
                      style={styles.miniSeenAvatar}
                    />
                  ) : (
                    <Icon name="checkmark-circle-outline" size={14} color="#9CA3AF" />
                  ))
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    });
  };

  const isSelectedUserBlocked =
    selectedChat &&
    currentUser?.blockedUsers?.some(
      (id: any) => id?.toString() === (selectedChat.participant._id || selectedChat.participant.id)?.toString()
    );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.text }]}>Messages</Text>
          <View style={styles.titleRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? '#10B981' : '#EF4444' },
              ]}
            />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              {isConnected ? 'Connected' : 'Connecting...'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Image
            source={{
              uri:
                currentUser?.profileImage ||
                'https://i.ibb.co/mcL9L2t/f10ff70a7155e5ab666bcdd1b45b726d.jpg',
            }}
            style={styles.headerAvatar}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'personal' && [styles.activeTab, { backgroundColor: colors.primary }],
            ]}
            onPress={() => setActiveTab('personal')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'personal' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              Chats
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'social' && [styles.activeTab, { backgroundColor: colors.primary }],
            ]}
            onPress={() => setActiveTab('social')}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'social' ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              Social
            </Text>
          </TouchableOpacity>
        </View>

        {renderRecentActivity()}
      </ScrollView>

      {/* Floating Action Button (New Chat) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Search')}
        activeOpacity={0.85}
      >
        <LinearGradient colors={colors.gradient as any} style={styles.fabGradient}>
          <Icon name="chatbubble-ellipses" size={26} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Long Press Chat Options Modal */}
      <Modal
        visible={actionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setActionModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
                {selectedChat && (
                  <View style={styles.actionSheetHeader}>
                    <Image
                      source={{ uri: selectedChat.participant.profileImage }}
                      style={styles.sheetAvatar}
                    />
                    <View style={{ marginLeft: 12 }}>
                      <Text style={[styles.sheetName, { color: colors.text }]}>
                        {selectedChat.participant.name}
                      </Text>
                      <Text style={[styles.sheetSub, { color: colors.textSecondary }]}>
                        Select an action
                      </Text>
                    </View>
                  </View>
                )}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* 1. Clear Chat Option */}
                <TouchableOpacity style={styles.actionItem} onPress={handleClearChat}>
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(99,102,241,0.1)' }]}>
                    <Icon name="brush-outline" size={20} color="#6366F1" />
                  </View>
                  <Text style={[styles.actionText, { color: colors.text }]}>Clear Messages</Text>
                </TouchableOpacity>

                {/* 2. Block / Unblock User Option */}
                <TouchableOpacity style={styles.actionItem} onPress={handleToggleBlockUser}>
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Icon
                      name={isSelectedUserBlocked ? 'lock-open-outline' : 'ban-outline'}
                      size={20}
                      color="#EF4444"
                    />
                  </View>
                  <Text style={[styles.actionText, { color: isSelectedUserBlocked ? '#10B981' : '#EF4444' }]}>
                    {isSelectedUserBlocked ? 'Unblock User' : 'Block User'}
                  </Text>
                </TouchableOpacity>

                {/* 3. Delete Conversation Option */}
                <TouchableOpacity style={styles.actionItem} onPress={handleDeleteConversation}>
                  <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Icon name="trash-outline" size={20} color="#EF4444" />
                  </View>
                  <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete Conversation</Text>
                </TouchableOpacity>

                {/* 4. Cancel */}
                <TouchableOpacity
                  style={[styles.cancelButton, { backgroundColor: colors.border }]}
                  onPress={() => setActionModalVisible(false)}
                >
                  <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {},
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    marginTop: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 15,
    marginTop: 12,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    position: 'relative',
  },
  chatAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#E2E8F0',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  chatInfo: {
    flex: 1,
    marginLeft: 14,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
  },
  chatTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  chatFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  chatLastMsg: {
    fontSize: 14,
    flex: 1,
    paddingRight: 10,
  },
  unreadLastMsg: {
    fontWeight: '700',
  },
  statusIndicatorContainer: {
    minWidth: 20,
    alignItems: 'flex-end',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  miniSeenAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineMsg: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 34,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    ...Shadows.primary,
  },
  fabGradient: {
    flex: 1,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  sheetName: {
    fontSize: 17,
    fontWeight: '700',
  },
  sheetSub: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HomeScreen;
