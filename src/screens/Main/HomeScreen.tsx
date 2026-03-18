import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Dimensions, Image, ActivityIndicator, RefreshControl } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, Shadows } from '../../theme/theme';
import { useProfile } from '../../context/ProfileContext';
import { getInbox } from '../../services/api';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useSocket } from '../../context/SocketContext';
import StorageService from '../../services/StorageService';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }: any) => {
    const { user: currentUser, loading: isProfileLoading } = useProfile();
    const [conversations, setConversations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // 1. Load from cache on first mount
    useEffect(() => {
        const loadCache = async () => {
            const cached = await StorageService.getInbox();
            if (cached.length > 0) {
                setConversations(cached);
                setLoading(false); // Stop showing loader if we have cache
            }
        };
        loadCache();
    }, []);

    const firstName = currentUser?.name?.split(' ')[0] || 'User';

    const fetchInbox = useCallback(async (isRefreshing = false) => {
        if (isRefreshing) setRefreshing(true);
        try {
            const response = await getInbox();
            if (response.success) {
                setConversations(response.data);
                StorageService.saveInbox(response.data);
            }
        } catch (error) {
            console.error('Fetch Inbox Error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // 2. Fetch fresh data when user profile is ready or screen focused
    useEffect(() => {
        if (currentUser) {
            fetchInbox();
        }
    }, [currentUser, fetchInbox]);

    useFocusEffect(
        useCallback(() => {
            fetchInbox();
        }, [fetchInbox])
    );

    const { isConnected, socket } = useSocket();

    // Socket listeners for real-time updates
    useEffect(() => {
        if (!currentUser || !socket) {
            console.log('⏳ HomeScreen: Waiting for socket/user...', { user: !!currentUser, socket: !!socket });
            return;
        }

        const myId = (currentUser.id || (currentUser as any)._id)?.toString();
        if (!myId) return;

        console.log('🔌 HomeScreen: Registering socket listeners for user:', myId);

        const handleNewMessage = (newMessage: any) => {
            console.log('📬 NEW MESSAGE AT HOME:', {
                id: newMessage._id,
                convId: newMessage.conversationId?._id || newMessage.conversationId,
                content: newMessage.content?.substring(0, 15)
            });

            setConversations(prev => {
                const incomingCid = (newMessage.conversationId?._id || newMessage.conversationId)?.toString();
                // Find existing conversation in list
                const existingIndex = prev.findIndex(c => {
                    const cid = (c._id || c.id)?.toString();
                    return cid === incomingCid;
                });

                let updatedConversations = [...prev];

                if (existingIndex !== -1) {
                    console.log('✅ Found existing conversation at index:', existingIndex);
                    // Clone the conversation to avoid direct mutation
                    const conv = { ...updatedConversations[existingIndex] };

                    // Update last message and timestamp
                    conv.lastMessage = newMessage;
                    conv.updatedAt = new Date().toISOString();

                    // Increment unread count locally for the receiver
                    const senderId = (typeof newMessage.senderId === 'object' ? newMessage.senderId._id : newMessage.senderId)?.toString();

                    if (senderId !== myId) {
                        console.log('🔔 Incrementing unread count...');
                        const unreadObj = conv.unreadCount && typeof conv.unreadCount === 'object' ? { ...conv.unreadCount } : {};
                        const currentCount = Number(unreadObj[myId] || 0);
                        unreadObj[myId] = currentCount + 1;
                        conv.unreadCount = unreadObj;
                    }

                    // Move to the very top (Messenger style)
                    updatedConversations.splice(existingIndex, 1);
                    updatedConversations.unshift(conv);
                } else {
                    console.log('❓ Conversation not in current list, refetching inbox...');
                    fetchInbox();
                }

                // Save to storage
                StorageService.saveInbox(updatedConversations);
                return updatedConversations;
            });
        };

        const handleStatusChange = (data: any) => {
            console.log('👤 Status changed:', data);
            if (!data.userId) return;
            const targetUid = data.userId.toString();

            setConversations(prev => prev.map(conv => {
                const updatedParticipants = conv.participants.map((p: any) => {
                    const pId = (p._id || p.id)?.toString();
                    if (pId === targetUid) {
                        return { ...p, isOnline: data.isOnline, lastSeen: data.lastSeen };
                    }
                    return p;
                });
                return { ...conv, participants: updatedParticipants };
            }));

            // Sync status changes to persistent storage too
            setConversations(current => {
                StorageService.saveInbox(current);
                return current;
            });
        };

        const handleSeen = (data: any) => {
            console.log('👀 Seen event:', data);
            const seenByUid = data.seenBy?.toString();
            const cid = data.conversationId?.toString();

            setConversations(prev => prev.map(conv => {
                if ((conv._id || conv.id)?.toString() === cid) {
                    let updatedConv = { ...conv };

                    // If I'm the one who saw it, clear my unread count
                    if (seenByUid === myId) {
                        const newUnread = conv.unreadCount && typeof conv.unreadCount === 'object' ? { ...conv.unreadCount } : {};
                        newUnread[myId] = 0;
                        updatedConv.unreadCount = newUnread;
                    }

                    // If the other person saw it AND my last message was sent to them, mark as read
                    if (seenByUid !== myId && conv.lastMessage) {
                        const lastMsgSenderId = (typeof conv.lastMessage.senderId === 'object' ? conv.lastMessage.senderId._id : conv.lastMessage.senderId)?.toString();
                        if (lastMsgSenderId === myId) {
                            updatedConv.lastMessage = { ...conv.lastMessage, status: 'read' };
                        }
                    }

                    return updatedConv;
                }
                return conv;
            }));

            // Sync seen status to storage
            setConversations(current => {
                StorageService.saveInbox(current);
                return current;
            });
        };

        // Attach listeners directly to the socket instance
        socket.on('receive_message', handleNewMessage);
        socket.on('user_status_change', handleStatusChange);
        socket.on('messages_seen', handleSeen);

        return () => {
            socket.off('receive_message', handleNewMessage);
            socket.off('user_status_change', handleStatusChange);
            socket.off('messages_seen', handleSeen);
        };
    }, [currentUser, socket, isConnected, fetchInbox]);

    const renderRecentActivity = () => {
        if (loading) {
            return (
                <View style={styles.emptyState}>
                    <ActivityIndicator color={Colors.primary} />
                </View>
            );
        }

        if (conversations.length === 0) {
            return (
                <View style={styles.emptyState}>
                    <Text style={styles.placeholderText}>No recent calls or messages.</Text>
                </View>
            );
        }

        return conversations.slice(0, 5).map((conv) => {
            const currentUserId = currentUser?.id || (currentUser as any)?._id;

            // Filter out the current user to find the other person in the chat
            const otherParticipant = conv.participants.find((p: any) => {
                const pId = (p._id || p.id)?.toString();
                const myId = currentUserId?.toString();
                return pId && myId && pId !== myId;
            });

            if (!otherParticipant) return null;

            // Extract unread count for current user
            const myIdStr = currentUserId?.toString();
            let unreadCount = 0;
            if (conv.unreadCount && myIdStr) {
                if (typeof conv.unreadCount === 'object' && conv.unreadCount[myIdStr] !== undefined) {
                    unreadCount = Number(conv.unreadCount[myIdStr]) || 0;
                } else if (typeof conv.unreadCount === 'number') {
                    unreadCount = conv.unreadCount;
                }
            }

            return (
                <TouchableOpacity
                    key={conv._id}
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
                            <Text style={styles.chatName}>{otherParticipant.name}</Text>
                            {conv.lastMessage && (
                                <Text style={styles.chatTime}>
                                    {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            )}
                        </View>
                        <View style={styles.chatFooterRow}>
                            <Text style={[
                                styles.chatLastMsg,
                                unreadCount > 0 && styles.unreadLastMsg
                            ]} numberOfLines={1}>
                                {conv.lastMessage?.contentType === 'image' ? '📷 Image' :
                                    conv.lastMessage?.contentType === 'video' ? '🎥 Video' :
                                        conv.lastMessage?.contentType === 'file' ? '📁 File' :
                                            conv.lastMessage?.content || 'Started a conversation'}
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
            <LinearGradient
                colors={[Colors.background, '#FFFFFF', Colors.background]}
                style={StyleSheet.absoluteFill}
            />

            <ScrollView 
                contentContainerStyle={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl 
                        refreshing={refreshing} 
                        onRefresh={() => fetchInbox(true)} 
                        colors={[Colors.primary]}
                        tintColor={Colors.primary}
                    />
                }
            >
                <View style={styles.header}>
                    <Text style={styles.greeting}>Hello, {firstName}!</Text>
                    <View style={styles.titleRow}>
                        <Text style={styles.title}>Your Connect</Text>
                        <View style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]} />
                    </View>
                </View>

                <View style={styles.glassCard}>
                    <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle}>Recent Activity</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>View All</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.divider} />
                    {renderRecentActivity()}
                </View>

                <View style={styles.quickActions}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('Calls')}
                    >
                        <LinearGradient
                            colors={['#2563EB', '#1D4ED8']}
                            style={styles.buttonGradient}
                        >
                            <Text style={styles.actionText}>New Call</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => navigation.navigate('Search')}
                    >
                        <View style={[styles.buttonGradient, styles.secondaryButton]}>
                            <Text style={[styles.actionText, { color: Colors.text }]}>Search</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    scrollContent: {
        padding: 24,
        paddingTop: 80,
    },
    header: {
        marginBottom: 35,
    },
    greeting: {
        color: Colors.textSecondary,
        fontSize: 16,
        fontWeight: '500',
        letterSpacing: 0.5,
    },
    title: {
        color: Colors.text,
        fontSize: 36,
        fontWeight: '900',
        marginTop: 8,
        letterSpacing: -0.5,
    },
    glassCard: {
        backgroundColor: Colors.surface,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: Colors.border,
        minHeight: 180,
        ...Shadows.default,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    cardTitle: {
        color: Colors.text,
        fontSize: 20,
        fontWeight: '700',
    },
    badge: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '700',
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginBottom: 20,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 100,
    },
    placeholderText: {
        color: Colors.textSecondary,
        textAlign: 'center',
        fontSize: 15,
    },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    chatAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#E5E7EB',
    },
    chatInfo: {
        flex: 1,
        marginLeft: 15,
    },
    chatName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
    },
    chatLastMsg: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    quickActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 28,
    },
    actionButton: {
        flex: 0.47,
        height: 60,
        ...Shadows.primary,
    },
    buttonGradient: {
        flex: 1,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    secondaryButton: {
        backgroundColor: Colors.surface,
        borderWidth: 1.5,
        borderColor: Colors.border,
    },
    actionText: {
        color: '#FFFFFF',
        fontWeight: '700',
        fontSize: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginLeft: 12,
        marginTop: 10,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
    },
    avatarContainer: {
        position: 'relative',
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#10B981',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    chatHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    chatFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    chatTime: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    unreadBadge: {
        backgroundColor: '#6366F1',
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
    unreadLastMsg: {
        color: '#000000',
        fontWeight: 'bold',
    },
    unreadDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#FFFFFF',
        marginRight: 4,
    },
    statusIndicatorContainer: {
        marginLeft: 8,
        minWidth: 20,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    miniSeenAvatar: {
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#E5E7EB',
    },
});

export default HomeScreen;
