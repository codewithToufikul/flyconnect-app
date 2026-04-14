import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getInbox } from '../services/api';
import { useProfile } from './ProfileContext';
import { useSocket } from './SocketContext';
import { useToast } from './ToastContext';
import StorageService from '../services/StorageService';
import { AppState } from 'react-native';

interface InboxContextType {
    conversations: any[];
    totalUnreadCount: number;
    totalMissedCallCount: number;
    refreshInbox: () => Promise<void>;
    updateConversationLocally: (conversationId: string, updates: any) => void;
    clearUnreadLocally: (conversationId: string) => void;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

export const InboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user: currentUser } = useProfile();
    const { socket } = useSocket();
    const { showToast } = useToast();
    const [conversations, setConversations] = useState<any[]>([]);
    const [totalUnreadCount, setTotalUnreadCount] = useState(0);
    const [totalMissedCallCount, setTotalMissedCallCount] = useState(0);

    const calculateCounts = useCallback((convs: any[]) => {
        const myId = currentUser?.id || (currentUser as any)?._id;
        if (!myId) return { unread: 0, missed: 0 };
        
        let unread = 0;
        let missed = 0;
        const myIdStr = myId.toString();

        convs.forEach(conv => {
            // Unread messages count
            let count = 0;
            if (conv.unreadCount && typeof conv.unreadCount === 'object') {
                count = Number(conv.unreadCount[myIdStr] || 0);
            } else if (typeof conv.unreadCount === 'number') {
                count = conv.unreadCount;
            }
            unread += count;

            // Missed calls count — specifically if last message is an unread MISSED call
            if (count > 0 && conv.lastMessage?.contentType === 'call_log') {
                const status = conv.lastMessage.metadata?.callStatus || conv.lastMessage.content;
                const isMissed = typeof status === 'string' && status.toUpperCase().includes('MISSED');
                const isRecipient = conv.lastMessage.metadata?.receiverId?.toString() === myIdStr || conv.lastMessage.senderId?.toString() !== myIdStr;
                
                if (isMissed && isRecipient) {
                    missed += 1;
                }
            }
        });

        return { unread, missed };
    }, [currentUser]);

    const refreshInbox = useCallback(async () => {
        try {
            const response = await getInbox();
            if (response.success) {
                setConversations(response.data);
                const { unread, missed } = calculateCounts(response.data);
                setTotalUnreadCount(unread);
                setTotalMissedCallCount(missed);
                StorageService.saveInbox(response.data);
            }
        } catch (error) {
            console.error('InboxContext: Fetch error', error);
        }
    }, [currentUser]);

    // Initial Load
    useEffect(() => {
        const init = async () => {
            const cached = await StorageService.getInbox();
            if (cached.length > 0) {
                setConversations(cached);
                const { unread, missed } = calculateCounts(cached);
                setTotalUnreadCount(unread);
                setTotalMissedCallCount(missed);
            }
            if (currentUser) refreshInbox();
        };
        init();
    }, [currentUser, refreshInbox]);

    // Socket Listeners
    useEffect(() => {
        if (!socket || !currentUser) return;

        const myId = (currentUser.id || (currentUser as any)._id)?.toString();

        const handleNewMessage = (msg: any) => {
            const cid = (msg.conversationId?._id || msg.conversationId)?.toString();
            const senderId = (msg.senderId?._id || msg.senderId?.id || msg.senderId)?.toString();

            // 1. Identify if we need to show a toast BEFORE updating state
            if (senderId !== myId && AppState.currentState === 'active') {
                const conv = conversations.find(c => (c._id || c.id)?.toString() === cid);
                const isMuted = conv?.mutedBy?.some((id: any) => id.toString() === myId);
                
                if (!isMuted) {
                    showToast({
                        senderId: msg.senderId?._id || msg.senderId?.id || (typeof msg.senderId === 'string' ? msg.senderId : ''),
                        senderName: msg.senderId?.name || 'New Message',
                        senderImage: msg.senderId?.profileImage,
                        message: msg.content || '',
                        conversationId: cid,
                        contentType: msg.contentType,
                    });
                }
            }
            
            // 2. Update conversations state
            setConversations(prev => {
                const idx = prev.findIndex(c => (c._id || c.id)?.toString() === cid);
                let updated = [...prev];

                if (idx !== -1) {
                    const conv = { ...updated[idx] };
                    conv.lastMessage = msg;
                    conv.updatedAt = new Date().toISOString();
                    conv.lastMessageAt = new Date().toISOString();

                    if (senderId !== myId) {
                        const unreadObj = { ...(conv.unreadCount && typeof conv.unreadCount === 'object' ? conv.unreadCount : {}) };
                        unreadObj[myId] = (Number(unreadObj[myId]) || 0) + 1;
                        conv.unreadCount = unreadObj;
                    }

                    updated.splice(idx, 1);
                    updated.unshift(conv);
                } else {
                    refreshInbox();
                }
                
                const { unread, missed } = calculateCounts(updated);
                setTotalUnreadCount(unread);
                setTotalMissedCallCount(missed);
                StorageService.saveInbox(updated);
                return updated;
            });
        };

        const handleSeen = (data: any) => {
            const seenBy = data.seenBy?.toString();
            const cid = data.conversationId?.toString();

            setConversations(prev => {
                const updated = prev.map(conv => {
                    if ((conv._id || conv.id)?.toString() === cid) {
                        let c = { ...conv };
                        if (seenBy === myId) {
                            const unread = { ...(conv.unreadCount && typeof conv.unreadCount === 'object' ? conv.unreadCount : {}) };
                            unread[myId] = 0;
                            c.unreadCount = unread;
                        }
                        if (seenBy !== myId && conv.lastMessage) {
                            const lastSender = (conv.lastMessage.senderId?._id || conv.lastMessage.senderId)?.toString();
                            if (lastSender === myId) {
                                c.lastMessage = { ...conv.lastMessage, status: 'read' };
                            }
                        }
                        return c;
                    }
                    return conv;
                });
                const { unread, missed } = calculateCounts(updated);
                setTotalUnreadCount(unread);
                setTotalMissedCallCount(missed);
                StorageService.saveInbox(updated);
                return updated;
            });
        };

        socket.on('receive_message', handleNewMessage);
        socket.on('messages_seen', handleSeen);

        return () => {
            socket.off('receive_message', handleNewMessage);
            socket.off('messages_seen', handleSeen);
        };
    }, [socket, currentUser, refreshInbox, showToast, calculateCounts]);

    const updateConversationLocally = useCallback((cid: string, updates: any) => {
        setConversations(prev => {
            const updated = prev.map(c => ((c._id || c.id)?.toString() === cid ? { ...c, ...updates } : c));
            const { unread, missed } = calculateCounts(updated);
            setTotalUnreadCount(unread);
            setTotalMissedCallCount(missed);
            return updated;
        });
    }, [calculateCounts]);

    const clearUnreadLocally = useCallback((cid: string) => {
        const myId = (currentUser?.id || (currentUser as any)?._id)?.toString();
        if (!myId) return;

        setConversations(prev => {
            // Check if there is actually anything to clear to avoid unnecessary updates
            const conv = prev.find(c => (c._id || c.id)?.toString() === cid);
            const currentUnread = conv?.unreadCount?.[myId] || 0;
            if (currentUnread === 0) return prev; 

            const updated = prev.map(c => {
                if ((c._id || c.id)?.toString() === cid) {
                    const unread = { ...(c.unreadCount && typeof c.unreadCount === 'object' ? c.unreadCount : {}) };
                    unread[myId] = 0;
                    return { ...c, unreadCount: unread };
                }
                return c;
            });
            const { unread, missed } = calculateCounts(updated);
            setTotalUnreadCount(unread);
            setTotalMissedCallCount(missed);
            StorageService.saveInbox(updated);
            return updated;
        });
    }, [currentUser, calculateCounts]);

    return (
        <InboxContext.Provider value={{ conversations, totalUnreadCount, totalMissedCallCount, refreshInbox, updateConversationLocally, clearUnreadLocally }}>
            {children}
        </InboxContext.Provider>
    );
};

export const useInbox = () => {
    const context = useContext(InboxContext);
    if (!context) throw new Error('useInbox must be used within InboxProvider');
    return context;
};
