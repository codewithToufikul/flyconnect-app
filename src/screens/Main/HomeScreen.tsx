import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Dimensions, Image, RefreshControl } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, Shadows } from '../../theme/theme';
import { useProfile } from '../../context/ProfileContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSocket } from '../../context/SocketContext';
import { useInbox } from '../../context/InboxContext';
import { DeviceEventEmitter } from 'react-native';
import { get } from '../../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }: any) => {
    const { user: currentUser } = useProfile();
    const { conversations, refreshInbox } = useInbox();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'personal' | 'social'>('personal');

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refreshInbox();
        setRefreshing(false);
    }, [refreshInbox]);

    const { isConnected } = useSocket();

    React.useEffect(() => {
        const sub = DeviceEventEmitter.addListener('NAVIGATE_TO_CHAT', async ({ userId }) => {
            console.log('🚀 [Home] Received direct navigation request for user:', userId);
            try {
                // Fetch full user profile to ensure ChatScreen has what it needs
                const response = await get<any>(`/api/v1/users/${userId}`);
                const targetUser = response?.user || { _id: userId, name: 'User' };
                
                navigation.navigate('ChatScreen', { user: targetUser });
            } catch (err) {
                console.error('❌ [Home] Failed to fetch target user for nav:', err);
                // Fallback navigation
                navigation.navigate('ChatScreen', { user: { _id: userId, name: 'User' } });
            }
        });

        // Robust Backup: Check if there's a pending target in storage (in case we missed the event)
        const checkPending = async () => {
            try {
                const pending = await AsyncStorage.getItem('@pending_nav_target');
                if (pending && pending.includes('chat:')) {
                    const userId = pending.split(':')[1];
                    console.log('🎯 [Home] Found pending target in storage:', userId);
                    // Don't remove it yet, let the listener handle it or handle it here
                    // If we handle it here, we should remove it
                    await AsyncStorage.removeItem('@pending_nav_target');
                    DeviceEventEmitter.emit('NAVIGATE_TO_CHAT', { userId });
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

    const renderRecentActivity = () => {
        if (filteredConversations.length === 0) {
            return (
                <View style={styles.emptyState}>
                    <Icon name="chatbubbles-outline" size={80} color="#F3F4F6" />
                    <Text style={styles.placeholderText}>Your conversations will appear here</Text>
                </View>
            );
        }

        return filteredConversations.map((conv) => {
            const currentUserId = currentUser?.id || (currentUser as any)?._id;
            const myIdStr = currentUserId?.toString();

            // Filter out the current user to find the other person in the chat
            const otherParticipant = conv.participants.find((p: any) => {
                const pId = (p._id || p.id)?.toString();
                return pId && myIdStr && pId !== myIdStr;
            });

            if (!otherParticipant) return null;

            // Extract unread count for current user
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
                    style={styles.chatItem}
                    onPress={() => navigation.navigate('ChatScreen', { user: otherParticipant })}
                >
                    <View style={styles.avatarContainer}>
                        <Image source={{ uri: otherParticipant.profileImage }} style={styles.chatAvatar} />
                        {otherParticipant.isOnline && (
                            <View style={styles.onlineIndicator} />
                        )}
                    </View>
                    <View style={styles.chatInfo}>
                        <View style={styles.chatHeaderRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.chatName}>{otherParticipant.name}</Text>
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
                            <Text style={[
                                styles.chatLastMsg,
                                unreadCount > 0 && styles.unreadLastMsg,
                                conv.lastMessage?.contentType === 'call_log' && conv.lastMessage?.content?.includes('MISSED') && { color: Colors.error }
                            ]} numberOfLines={1}>
                                {conv.lastMessage?.contentType === 'image' ? (
                                    <View style={styles.msgRow}><Icon name="camera-outline" size={16} color="#6B7280" /><Text style={styles.inlineMsg}> Image</Text></View>
                                ) : conv.lastMessage?.contentType === 'video' ? (
                                    <View style={styles.msgRow}><Icon name="videocam-outline" size={16} color="#6B7280" /><Text style={styles.inlineMsg}> Video</Text></View>
                                ) : conv.lastMessage?.contentType === 'file' ? (
                                    <View style={styles.msgRow}><Icon name="document-outline" size={16} color="#6B7280" /><Text style={styles.inlineMsg}> File</Text></View>
                                ) : conv.lastMessage?.contentType === 'call_log' ? (
                                    <View style={styles.msgRow}>
                                        <Icon
                                            name={
                                                conv.lastMessage?.metadata?.callType === 'video'
                                                    ? 'videocam'
                                                    : 'call'
                                            }
                                            size={14}
                                            color={conv.lastMessage?.metadata?.callStatus === 'MISSED' ? Colors.error : '#6B7280'}
                                        />
                                        <Text style={[
                                            styles.inlineMsg,
                                            conv.lastMessage?.metadata?.callStatus === 'MISSED' && { color: Colors.error }
                                        ]}>
                                            {/* Incoming/Outgoing Arrow Indicator */}
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
                                    <View style={styles.unreadBadge}>
                                        <Text style={styles.unreadCountText}>{unreadCount}</Text>
                                    </View>
                                ) : (
                                    conv.lastMessage && (typeof conv.lastMessage.senderId === 'object' ? conv.lastMessage.senderId._id : conv.lastMessage.senderId)?.toString() === myIdStr && (
                                        conv.lastMessage.status === 'read' ? (
                                            <Image
                                                source={{ uri: otherParticipant.profileImage }}
                                                style={styles.miniSeenAvatar}
                                            />
                                        ) : (
                                            <Icon name="checkmark-circle-outline" size={14} color="#9CA3AF" />
                                        )
                                    )
                                )}
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>
            );
        });
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.greeting}>Messages</Text>
                    <View style={styles.titleRow}>
                        <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]} />
                        <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Connecting...'}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
                    <Image
                        source={{ uri: currentUser?.profileImage || 'https://i.ibb.co/mcL9L2t/f10ff70a7155e5ab666bcdd1b45b726d.jpg' }}
                        style={styles.headerAvatar}
                    />
                </TouchableOpacity>
            </View>
            <View style={styles.tabContainer}>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'personal' && styles.activeTab]}
                    onPress={() => setActiveTab('personal')}
                >
                    <Text style={[styles.tabText, activeTab === 'personal' && styles.activeTabText]}>Personal</Text>
                    {conversations.filter(c => !c.category || c.category === 'normal').some(c => {
                        const myId = currentUser?.id || (currentUser as any)?._id;
                        return c.unreadCount?.[myId?.toString()] > 0;
                    }) && <View style={styles.tabDot} />}
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.tab, activeTab === 'social' && styles.activeTab]}
                    onPress={() => setActiveTab('social')}
                >
                    <Text style={[styles.tabText, activeTab === 'social' && styles.activeTabText]}>Social Response</Text>
                    {conversations.filter(c => c.category === 'social_response').some(c => {
                        const myId = currentUser?.id || (currentUser as any)?._id;
                        return c.unreadCount?.[myId?.toString()] > 0;
                    }) && <View style={[styles.tabDot, { backgroundColor: '#8B5CF6' }]} />}
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={[Colors.primary]}
                        tintColor={Colors.primary}
                    />
                }
            >
                {renderRecentActivity()}
            </ScrollView>
            {/* <TouchableOpacity 
                style={styles.fab}
                onPress={() => navigation.navigate('Search')}
            >
                <LinearGradient
                    colors={[Colors.primary, '#4F46E5']}
                    style={styles.fabGradient}
                >
                    <Icon name="chatbubbles" size={24} color="#FFF" />
                </LinearGradient>
            </TouchableOpacity> */}
        </View>
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
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        backgroundColor: '#FFFFFF',
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        marginBottom: 10,
        gap: 12,
    },
    tab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        flexDirection: 'row',
        alignItems: 'center',
    },
    activeTab: {
        backgroundColor: Colors.primary,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    activeTabText: {
        color: '#FFFFFF',
    },
    tabDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#EF4444',
        marginLeft: 6,
    },
    headerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#F3F4F6',
    },
    greeting: {
        fontSize: 28,
        fontWeight: '800',
        color: '#111827',
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
        color: '#6B7280',
        fontWeight: '500',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    emptyState: {
        marginTop: 100,
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: '#9CA3AF',
        fontSize: 16,
        marginTop: 12,
    },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F9FAFB',
    },
    avatarContainer: {
        position: 'relative',
    },
    chatAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#F3F4F6',
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
        marginLeft: 16,
    },
    chatHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    chatName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
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
        color: '#6B7280',
        flex: 1,
        paddingRight: 10,
    },
    unreadLastMsg: {
        color: '#111827',
        fontWeight: '700',
    },
    statusIndicatorContainer: {
        minWidth: 20,
        alignItems: 'flex-end',
    },
    unreadBadge: {
        backgroundColor: Colors.primary,
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
        bottom: 40,
        right: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        ...Shadows.primary,
    },
    fabGradient: {
        flex: 1,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default HomeScreen;
