import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Shadows, Spacing } from '../../theme/theme';
import { getCallHistory } from '../../services/api';
import { useCall } from '../../context/CallContext';
import { useProfile } from '../../context/ProfileContext';

interface CallRecord {
  _id: string;
  callId: string;
  callerId: {
    _id: string;
    name: string;
    profileImage?: string;
    isOnline?: boolean;
    lastSeen?: string;
  };
  receiverId: {
    _id: string;
    name: string;
    profileImage?: string;
    isOnline?: boolean;
    lastSeen?: string;
  };
  type: 'audio' | 'video';
  status: 'REQUESTED' | 'RINGING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'ENDED' | 'MISSED';
  duration: number;
  createdAt: string;
}

const CallsScreen = () => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'All' | 'Missed'>('All');
  const { initiateCall } = useCall();
  const { user } = useProfile();

  const currentUserId = (user as any)?._id || (user as any)?.id;

  const fetchHistory = useCallback(async (isRefreshing = false) => {
    if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await getCallHistory();
      if (response.success) {
        setCalls(response.history);
      }
    } catch (error) {
      console.error('Fetch Call History Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredCalls = calls.filter(call => {
    if (activeTab === 'All') return true;
    return call.status === 'MISSED' || (call.status === 'CANCELLED' && call.receiverId._id === currentUserId);
  });

  const formatDuration = (seconds: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '--:--';
      
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');

      if (isToday) {
        return `${hours}:${mins}`;
      }
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}`;
    } catch {
      return '--:--';
    }
  };

  const renderCallItem = ({ item }: { item: CallRecord }) => {
    const isOutgoing = item.callerId._id === currentUserId;
    const otherUser = isOutgoing ? item.receiverId : item.callerId;

    let statusIcon = 'call-outline';
    let statusColor = Colors.textSecondary;
    let statusText = '';

    if (item.status === 'MISSED' || (item.status === 'CANCELLED' && !isOutgoing)) {
      statusIcon = 'call';
      statusColor = Colors.error;
      statusText = 'Missed';
    } else if (isOutgoing) {
      statusIcon = 'arrow-up-outline';
      statusColor = Colors.success;
      statusText = 'Outgoing';
    } else {
      statusIcon = 'arrow-down-outline';
      statusColor = Colors.primary;
      statusText = 'Incoming';
    }

    return (
      <TouchableOpacity style={styles.callItem} activeOpacity={0.7}>
        <View style={styles.avatarWrapper}>
          {otherUser.profileImage ? (
            <Image source={{ uri: otherUser.profileImage }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {otherUser.name?.charAt(0)?.toUpperCase()}
              </Text>
            </View>
          )}
          {otherUser.isOnline && (
            <View style={styles.onlineStatusDot} />
          )}
        </View>
        <View style={styles.callInfo}>
          <Text style={[styles.userName, item.status === 'MISSED' && { color: Colors.error }]}>
            {otherUser.name}
          </Text>
          <View style={styles.statusRow}>
            <Icon name={statusIcon} size={14} color={statusColor} style={styles.statusIcon} />
            <Text style={styles.statusText}>
              {statusText} {item.duration > 0 ? `(${formatDuration(item.duration)})` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.rightInfo}>
          <Text style={styles.timeText}>{formatDate(item.createdAt)}</Text>
          <TouchableOpacity
            onPress={() => initiateCall(otherUser._id, item.type, otherUser.name, otherUser.profileImage)}
            style={styles.callbackBtn}
          >
            <Icon name={item.type === 'video' ? 'videocam-outline' : 'call-outline'} size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calls</Text>
        {/* <TouchableOpacity style={styles.newCallBtn}>
          <Icon name="add" size={24} color={Colors.white} />
        </TouchableOpacity> */}
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {['All', 'Missed'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredCalls}
          renderItem={renderCallItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchHistory(true)} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="call-outline" size={64} color={Colors.border} />
              <Text style={styles.emptyText}>No call history yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 60,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
  },
  newCallBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.primary,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: '#EDF2F7',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: Colors.white,
    ...Shadows.default,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  activeTabText: {
    color: Colors.primary,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.border,
  },
  avatarFallback: {
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  onlineStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: Colors.white,
  },
  callInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    marginRight: 4,
  },
  statusText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  rightInfo: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  callbackBtn: {
    padding: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: 16,
    color: Colors.textSecondary,
  },
});

export default CallsScreen;