import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Image,
    ActivityIndicator,
    StatusBar,
    Animated,
    Modal,
    Dimensions,
    Alert,
    TouchableWithoutFeedback,
    PermissionsAndroid,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import Video from 'react-native-video';
import ImageView from 'react-native-image-viewing';
import RNBlobUtil from 'react-native-blob-util';
import { getOrCreateConversation, getChatMessages, get } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { useProfile } from '../../context/ProfileContext';
import StorageService from '../../services/StorageService';
import { SafeAreaView } from 'react-native-safe-area-context';
import MediaService, { PickedMedia } from '../../services/MediaService';
import { useCall } from '../../context/CallContext';
import { useInbox } from '../../context/InboxContext';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingMedia {
    picked: PickedMedia;
    uploading: boolean;
    progress: number;
}

// ─── File helpers ─────────────────────────────────────────────────────────────

/** Return icon name + background colour for a file extension / mime type. */
function fileIconInfo(fileName: string, mimeType?: string): { icon: string; color: string } {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const mime = mimeType ?? '';

    if (ext === 'pdf' || mime.includes('pdf'))
        return { icon: 'document-text', color: '#EF4444' };
    if (['doc', 'docx'].includes(ext) || mime.includes('word'))
        return { icon: 'document-text', color: '#3B82F6' };
    if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel'))
        return { icon: 'grid', color: '#10B981' };
    if (['ppt', 'pptx'].includes(ext) || mime.includes('presentation') || mime.includes('powerpoint'))
        return { icon: 'easel', color: '#F59E0B' };
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
        return { icon: 'archive', color: '#8B5CF6' };
    if (['txt', 'md', 'log'].includes(ext))
        return { icon: 'document', color: '#6B7280' };
    return { icon: 'attach', color: '#6366F1' };
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLastSeen(date: string | Date | undefined): string {
    if (!date) return '';
    try {
        const lastSeen = new Date(date);
        if (isNaN(lastSeen.getTime())) return '';
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - lastSeen.getTime()) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;

        // Manual format to avoid toLocaleDateString crash in some environments
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[lastSeen.getMonth()];
        const day = lastSeen.getDate();
        const hours = lastSeen.getHours().toString().padStart(2, '0');
        const mins = lastSeen.getMinutes().toString().padStart(2, '0');
        return `${month} ${day}, ${hours}:${mins}`;
    } catch (e) {
        return '';
    }
}

function formatSafeTime(dateStr: string | Date): string {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '--:--';
        const hours = date.getHours().toString().padStart(2, '0');
        const mins = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${mins}`;
    } catch (e) {
        return '--:--';
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

const EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍', '🙌'];

const ChatScreen = ({ route, navigation }: any) => {
    const { user: initialUser, userId: deepLinkedUserId } = route.params || {};
    const [otherUser, setOtherUser] = useState<any>(initialUser);
    const [loadingUser, setLoadingUser] = useState(!initialUser && !!deepLinkedUserId);

    const { user: currentUser } = useProfile();
    const { initiateCall } = useCall();
    const { clearUnreadLocally } = useInbox();
    const { socket } = useSocket();

    const [messages, setMessages] = useState<any[]>([]);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
    const [showAttachMenu, setShowAttachMenu] = useState(false);

    // Video player
    const [videoPlayerUrl, setVideoPlayerUrl] = useState<string | null>(null);
    const [videoLoading, setVideoLoading] = useState(true);
    const [videoPaused, setVideoPaused] = useState(false);

    // User status
    const [userStatus, setUserStatus] = useState({
        isOnline: otherUser?.isOnline || false,
        lastSeen: otherUser?.lastSeen || null
    });

    // File download tracking: messageId → 'downloading' | 'done'
    const [downloadingIds, setDownloadingIds] = useState<Record<string, string>>({});

    // Editing mode
    const [editingMessage, setEditingMessage] = useState<any | null>(null);
    const [replyingToMessage, setReplyingToMessage] = useState<any | null>(null);

    // Custom Action Sheet (Long press options)
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<any | null>(null);

    // Custom Confirmation Modal
    const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [isDownloadingImage, setIsDownloadingImage] = useState(false);
    const [typingUser, setTypingUser] = useState<string | null>(null);

    // Typing status
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const typingTimeoutRef = useRef<any>(null);

    // ── Audio recording (Lazy Init) ──
    const getRecorder = () => {
        try {
            return AudioRecorderPlayer;
        } catch (e) {
            console.error('Safe-Init: AudioRecorderPlayer failed:', e);
            return null;
        }
    };
    const [isRecording, setIsRecording] = useState(false);
    const [recordTime, setRecordTime] = useState('00:00');
    const [recordSecs, setRecordSecs] = useState(0);
    const [lastPlayedId, setLastPlayedId] = useState<string | null>(null);
    const [audioStatus, setAudioStatus] = useState<Record<string, {
        isPlaying: boolean;
        currentPosition: number;
        duration: number;
    }>>({});

    const otherUserId = (otherUser as any)?._id || (otherUser as any)?.id || deepLinkedUserId;
    const currentUserId = (currentUser as any)?._id || (currentUser as any)?.id;

    const flatListRef = useRef<FlatList>(null);
    const progressAnim = useRef(new Animated.Value(0)).current;
    
    // Safety guard
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // ── Handle Deep Linking (if only userId is provided) ───────────────────
    useEffect(() => {
        const fetchUserData = async () => {
            if (!otherUser && deepLinkedUserId) {
                setLoadingUser(true);
                try {
                    const response = await get<any>(`/api/v1/users/${deepLinkedUserId}`);
                    if (isMounted.current) {
                        if (response?.user) {
                            setOtherUser(response.user);
                            setUserStatus({
                                isOnline: response.user.isOnline || false,
                                lastSeen: response.user.lastSeen || null
                            });
                        } else {
                            Alert.alert('Error', 'User not found or deleted.');
                            navigation.goBack();
                        }
                    }
                } catch (error) {
                    if (isMounted.current) {
                        console.error('❌ Failed to fetch deep linked user:', error);
                        Alert.alert('Error', 'Could not load user details.');
                        navigation.goBack();
                    }
                } finally {
                    if (isMounted.current) setLoadingUser(false);
                }
            }
        };
        fetchUserData();
    }, [deepLinkedUserId]);

    // ── Init ──────────────────────────────────────────────────────────────────

    useEffect(() => {
        const initChat = async () => {
            try {
                if (!otherUserId) return;
                // 1. Get/Create Conversation
                const response = await getOrCreateConversation(otherUserId);
                if (!isMounted.current) return;

                if (response.success && response.data?._id) {
                    const cId = response.data._id;
                    setConversationId(cId);

                    // Load cache BEFORE fetching
                    const cached = await StorageService.getMessages(cId);
                    if (isMounted.current && cached && Array.isArray(cached) && cached.length > 0) {
                        setMessages(cached);
                        setLoading(false);
                    }

                    loadMessages(cId, 1);
                }

                // 2. Fetch latest status
                const userResponse = await get<any>(`/api/v1/users/${otherUserId}`);
                if (isMounted.current && userResponse?.success && userResponse?.user) {
                    setUserStatus({
                        isOnline: userResponse.user.isOnline,
                        lastSeen: userResponse.user.lastSeen
                    });
                }
            } catch (error) {
                console.error('Init Chat Error:', error);
            }
        };
        initChat();
    }, [otherUserId]);

    useEffect(() => {
        if (!socket || !otherUserId || !currentUserId) return;

        const handleReceiveMessage = (newMessage: any) => {
            if (!newMessage || !isMounted.current) return;
            const convId = newMessage.conversationId?._id || newMessage.conversationId;
            const incomingCid = convId?.toString();
            
            if (incomingCid === conversationId) {
                setMessages(prev => {
                    if (!Array.isArray(prev)) return [newMessage];
                    const existingIndex = prev.findIndex(m => m?._id === newMessage._id);
                    if (existingIndex > -1) return prev;
                    
                    if (newMessage.senderId?._id?.toString() === currentUserId?.toString()) {
                        const tempIndex = prev.findIndex(m => m?._id?.toString().startsWith('temp-') && m.content === newMessage.content);
                        if (tempIndex > -1) {
                            const newMessages = [...prev];
                            newMessages[tempIndex] = newMessage;
                            StorageService.saveMessages(conversationId!, newMessages);
                            return newMessages;
                        }
                    }
                    const updated = [newMessage, ...prev];
                    if (conversationId) StorageService.saveMessages(conversationId, updated);
                    return updated;
                });
            }
        };

        const handleStatusChange = (data: any) => {
            if (!isMounted.current) return;
            if (data.userId?.toString() === otherUserId?.toString()) {
                setUserStatus({ isOnline: data.isOnline, lastSeen: data.lastSeen });
            }
        };

        const handleTyping = (data: any) => {
            if (data.conversationId === conversationId && data.userId?.toString() === otherUserId?.toString()) {
                setIsPartnerTyping(data.isTyping);
            }
        };

        const handleSeen = (data: any) => {
            if (data.conversationId === conversationId && data.seenBy?.toString() === otherUserId?.toString()) {
                setMessages(prev => {
                    const otherUserIdStr = otherUserId?.toString();
                    const currentUserIdStr = currentUserId?.toString();
                    const isOwnMessage = (msg: any) => (msg.senderId?._id || msg.senderId)?.toString() === currentUserIdStr;

                    const updatedMessages = prev.map(msg => (isOwnMessage(msg) && msg.status !== 'read' ? { ...msg, status: 'read' } : msg));
                    StorageService.saveMessages(conversationId!, updatedMessages);
                    return updatedMessages;
                });
            }
        };

        const handleEdited = (data: any) => {
            if (data.conversationId === conversationId) {
                setMessages(prev => {
                    const updatedMessages = prev.map(msg => (msg as any)._id === data.messageId ? { ...msg, content: data.newContent, isEdited: true } : msg);
                    StorageService.saveMessages(conversationId!, updatedMessages);
                    return updatedMessages;
                });
            }
        };

        const handleDeleted = (data: any) => {
            if (data.conversationId === conversationId) {
                setMessages(prev => {
                    const updatedMessages = prev.map(msg => (msg as any)._id === data.messageId ? { ...msg, content: 'This message was deleted', isDeleted: true, mediaUrl: null, thumbnailUrl: null } : msg);
                    StorageService.saveMessages(conversationId!, updatedMessages);
                    return updatedMessages;
                });
            }
        };

        const handleReaction = (data: any) => {
            if (data.conversationId === conversationId) {
                setMessages(prev => {
                    const updatedMessages = prev.map(msg => (msg as any)._id === data.messageId ? { ...msg, reactions: data.reactions } : msg);
                    StorageService.saveMessages(conversationId!, updatedMessages);
                    return updatedMessages;
                });
            }
        };

        socket.on('receive_message', handleReceiveMessage);
        socket.on('user_status_change', handleStatusChange);
        socket.on('user_typing', handleTyping);
        socket.on('messages_seen', handleSeen);
        socket.on('message_edited', handleEdited);
        socket.on('message_deleted', handleDeleted);
        socket.on('message_reaction_updated', handleReaction);

        return () => {
            socket.off('receive_message', handleReceiveMessage);
            socket.off('user_status_change', handleStatusChange);
            socket.off('user_typing', handleTyping);
            socket.off('messages_seen', handleSeen);
            socket.off('message_edited', handleEdited);
            socket.off('message_deleted', handleDeleted);
            socket.off('message_reaction_updated', handleReaction);
        };
    }, [socket, otherUserId, conversationId, currentUserId]);

    // Cleanup audio
    useEffect(() => {
        return () => {
            try {
            const recorder = getRecorder();
            if (recorder) {
                try {
                    recorder.stopPlayer();
                    recorder.removePlayBackListener();
                    recorder.stopRecorder();
                    recorder.removeRecordBackListener();
                } catch (e) {
                    console.error('Cleanup: Recorder error ignored:', e);
                }
            }
            } catch (e) {
                console.log('Cleanup suppressed:', e);
            }
        };
    }, []);

    // Send mark_as_read when entering or receiving messages
    useEffect(() => {
        if (conversationId) {
            socket.emit('mark_as_read', {
                conversationId,
                senderId: otherUserId // We represent the person whose messages were seen
            });
            clearUnreadLocally(conversationId);
        }
    }, [conversationId, messages[0]?._id, otherUserId, clearUnreadLocally]);

    // Animate progress bar
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: pendingMedia?.progress ?? 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
        if (!pendingMedia) progressAnim.setValue(0);
    }, [pendingMedia?.progress]);

    // ── Messages ──────────────────────────────────────────────────────────────

    const loadMessages = async (id: string, pageNum: number) => {
        try {
            if (!id) return;
            const response = await getChatMessages(id, pageNum);
            if (!isMounted.current) return;

            if (response.success && Array.isArray(response.data)) {
                if (pageNum === 1) {
                    setMessages(response.data);
                    StorageService.saveMessages(id, response.data);
                } else {
                    setMessages(prev => {
                        const newMsgs = [...prev, ...response.data];
                        // Deduplicate
                        const unique = Array.from(new Map(newMsgs.map(m => [m._id, m])).values());
                        return unique;
                    });
                }
                setHasMore(response.pagination?.hasMore ?? response.data.length === 20);
            }
        } catch (error) {
            console.error('Load Messages Error:', error);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    // ── Pick media / file ─────────────────────────────────────────────────────

    const handlePickMedia = async (type: 'image' | 'video' | 'file') => {
        try {
            let picked: PickedMedia | null = null;
            if (type === 'image') picked = await MediaService.pickImage();
            else if (type === 'video') picked = await MediaService.pickVideo();
            else picked = await MediaService.pickFile();
            if (picked) setPendingMedia({ picked, uploading: false, progress: 0 });
        } catch (error) {
            console.error('Pick error:', error);
        }
    };

    const handleCancelMedia = () => setPendingMedia(null);

    // ── Send ──────────────────────────────────────────────────────────────────

    const handleMessageActions = (item: any) => {
        if (item.isDeleted) return;

        setSelectedMessage(item);
        setActionSheetVisible(true);
    };

    const handleReaction = (emoji: string) => {
        if (!selectedMessage || !conversationId) return;

        const msgId = (selectedMessage as any)._id;
        if (!msgId) return;

        // Emit reaction
        socket.emit('message_reaction', {
            messageId: msgId,
            conversationId,
            receiverId: otherUserId,
            emoji
        });

        // Optimistic update locally
        setMessages(prev => prev.map((msg: any) => {
            if (msg._id === msgId) {
                const reactions = [...(msg.reactions || [])];
                const existingUserReactionIndex = reactions.findIndex(
                    (r: any) => r.userId?.toString() === currentUserId?.toString()
                );

                if (existingUserReactionIndex > -1) {
                    const oldEmoji = reactions[existingUserReactionIndex].emoji;
                    reactions.splice(existingUserReactionIndex, 1);
                    if (oldEmoji !== emoji) {
                        reactions.push({ userId: currentUserId, emoji });
                    }
                } else {
                    reactions.push({ userId: currentUserId, emoji });
                }
                return { ...msg, reactions };
            }
            return msg;
        }));

        setActionSheetVisible(false);
    };

    const confirmDeleteMessage = () => {
        if (!selectedMessage) return;

        // 1. Emit delete event
        const msgId = (selectedMessage as any)?._id;
        if (!msgId) return;

        socket.emit('delete_message', {
            messageId: msgId,
            conversationId,
            receiverId: otherUserId
        });

        // 2. Update local state
        setMessages(prev => prev.map(msg =>
            (msg as any)._id === msgId
                ? { ...msg, content: 'This message was deleted', isDeleted: true, mediaUrl: null, thumbnailUrl: null }
                : msg
        ));

        setConfirmDeleteVisible(false);
        setActionSheetVisible(false);
        setSelectedMessage(null);
    };

    const handleEditAction = () => {
        if (selectedMessage && selectedMessage.contentType === 'text') {
            setEditingMessage(selectedMessage);
            setInputText(selectedMessage.content);
            setActionSheetVisible(false);
        } else if (selectedMessage) {
            Alert.alert('Info', 'Only text messages can be edited.');
            setActionSheetVisible(false);
        }
    };

    const handleReplyAction = () => {
        if (selectedMessage) {
            setReplyingToMessage(selectedMessage);
            setActionSheetVisible(false);
        }
    };

    const handleSendMessage = useCallback(async () => {
        if (!conversationId) return;

        // --- Editing Mode ---
        if (editingMessage) {
            const newContent = inputText.trim();
            if (!newContent || newContent === editingMessage.content) { // Don't send if content is empty or unchanged
                setEditingMessage(null);
                setInputText('');
                return;
            }

            // 1. Emit edit event
            const msgId = (editingMessage as any)?._id;
            if (!msgId) return;

            socket.emit('edit_message', {
                messageId: msgId,
                conversationId,
                receiverId: otherUserId,
                newContent
            });

            // 2. Update local state
            setMessages(prev => prev.map(msg =>
                (msg as any)._id === msgId ? { ...msg, content: newContent, isEdited: true } : msg
            ));

            // 3. Clear editing mode
            setEditingMessage(null);
            setInputText('');
            return;
        }

        // ── Media / File ─────────────────────────────────────────────────────
        if (pendingMedia) {
            setPendingMedia(prev => prev && { ...prev, uploading: true, progress: 0 });

            const optimisticId = `temp-${Date.now()}`;
            const { picked } = pendingMedia;

            const optimisticMsg: any = {
                _id: optimisticId,
                conversationId,
                senderId: currentUserId,
                content:
                    picked.type === 'image'
                        ? 'Sent an image'
                        : picked.type === 'video'
                            ? 'Sent a video'
                            : `Sent a file: ${picked.fileName}`,
                contentType: picked.type,
                localUri: picked.localUri,
                thumbnailUri: picked.thumbnailUri,
                fileName: picked.fileName,
                fileSize: picked.fileSize,
                mimeType: picked.mimeType,
                uploading: true,
                uploadProgress: 0,
                createdAt: new Date().toISOString(),
                replyTo: replyingToMessage ? {
                    ...replyingToMessage,
                    senderId: replyingToMessage.senderId || { name: otherUser?.name }
                } : null,
            };
            setMessages(prev => {
                const updated = [optimisticMsg, ...prev];
                StorageService.saveMessages(conversationId!, updated);
                return updated;
            });

            try {
                const result = await MediaService.uploadMedia(picked, pct => {
                    setPendingMedia(prev => prev && { ...prev, progress: pct });
                    setMessages(prev =>
                        prev.map(m =>
                            m._id === optimisticId ? { ...m, uploadProgress: pct } : m,
                        ),
                    );
                });

                setMessages(prev =>
                    prev.map(m =>
                        m._id === optimisticId
                            ? {
                                ...m,
                                uploading: false,
                                uploadProgress: 100,
                                mediaUrl: result.url,
                                thumbnailUrl: result.thumbnailUrl,
                                localUri: result.localUri,
                                thumbnailUri: result.thumbnailUri,
                                fileSize: result.fileSize,
                                fileName: result.fileName,
                                mimeType: result.mimeType,
                            }
                            : m,
                    ),
                );

                socket.emit('send_message', {
                    conversationId,
                    receiverId: otherUserId,
                    content: optimisticMsg.content,
                    contentType: picked.type,
                    mediaUrl: result.url,
                    thumbnailUrl: result.thumbnailUrl,
                    fileSize: result.fileSize,
                    fileName: result.fileName,
                    metadata: result.metadata,
                    replyTo: replyingToMessage?._id,
                });
                setReplyingToMessage(null);
            } catch (err) {
                console.error('Upload failed:', err);
                setMessages(prev => prev.filter(m => m._id !== optimisticId));
                Alert.alert('Upload Failed', 'Could not upload the file. Please try again.');
            } finally {
                setPendingMedia(null);
            }
            return;
        }

        // ── Text ─────────────────────────────────────────────────────────────
        if (!inputText.trim()) return;
        const messageData = {
            conversationId,
            receiverId: otherUserId,
            content: inputText.trim(),
            contentType: 'text',
            replyTo: replyingToMessage?._id,
        };
        socket.emit('send_message', messageData);
        setMessages(prev => {
            const updated = [
                {
                    ...messageData,
                    _id: `temp-${Date.now()}`,
                    senderId: currentUserId,
                    replyTo: replyingToMessage ? {
                        ...replyingToMessage,
                        senderId: replyingToMessage.senderId || { name: otherUser?.name }
                    } : null,
                    createdAt: new Date().toISOString(),
                },
                ...prev,
            ];
            StorageService.saveMessages(conversationId!, updated);
            return updated;
        });
        setInputText('');
        setReplyingToMessage(null);
    }, [conversationId, inputText, pendingMedia, otherUserId, currentUser, editingMessage, replyingToMessage, currentUserId, otherUser?.name]);

    const handleSendVoice = async (uri: string, duration: number) => {
        if (!conversationId) return;

        const optimisticId = `temp-${Date.now()}`;
        const fileName = `voice_${Date.now()}.mp3`;

        const picked: PickedMedia = {
            localUri: uri,
            fileName,
            fileSize: 0, // Will be updated after upload or we can estimate
            mimeType: 'audio/mpeg',
            type: 'audio',
            metadata: { duration }
        };

        const optimisticMsg: any = {
            _id: optimisticId,
            conversationId,
            senderId: currentUserId,
            content: 'Sent a voice message',
            contentType: 'audio',
            localUri: uri,
            metadata: { duration },
            uploading: true,
            uploadProgress: 0,
            createdAt: new Date().toISOString(),
            replyTo: replyingToMessage ? {
                ...replyingToMessage,
                senderId: replyingToMessage.senderId || { name: otherUser?.name }
            } : null,
        };

        setMessages(prev => {
            const updated = [optimisticMsg, ...prev];
            StorageService.saveMessages(conversationId, updated);
            return updated;
        });

        try {
            const result = await MediaService.uploadMedia(picked, pct => {
                setMessages(prev =>
                    prev.map(m =>
                        m._id === optimisticId ? { ...m, uploadProgress: pct } : m
                    )
                );
            });

            setMessages(prev =>
                prev.map(m =>
                    m._id === optimisticId
                        ? {
                            ...m,
                            uploading: false,
                            uploadProgress: 100,
                            mediaUrl: result.url,
                        }
                        : m,
                ),
            );

            socket.emit('send_message', {
                conversationId,
                receiverId: otherUserId,
                content: 'Sent a voice message',
                contentType: 'audio',
                mediaUrl: result.url,
                metadata: { duration },
                replyTo: replyingToMessage?._id,
            });
            setReplyingToMessage(null);
        } catch (err) {
            console.error('Voice upload failed:', err);
            setMessages(prev => prev.filter(m => m._id !== optimisticId));
            Alert.alert('Upload Failed', 'Could not send voice message.');
        }
    };

    const onStartRecord = async () => {
        try {
            if (Platform.OS === 'android') {
                const grants = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                ]);

                if (grants['android.permission.RECORD_AUDIO'] !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Permission Denied', 'Microphone permission is required.');
                    return;
                }
            } else {
                const res = await request(PERMISSIONS.IOS.MICROPHONE);
                if (res !== RESULTS.GRANTED) return;
            }

            const path = Platform.select({
                ios: `voice_${Date.now()}.m4a`,
                android: `${RNBlobUtil.fs.dirs.CacheDir}/voice_${Date.now()}.mp3`,
            });

            setRecordSecs(0);
            setRecordTime('00:00');
            setIsRecording(true);

            const recorder = getRecorder();
            if (!recorder) return;
            const result = await recorder.startRecorder(path);
            recorder.addRecordBackListener((e: any) => {
                setRecordTime(recorder.mmssss(Math.floor(e.currentPosition)));
                setRecordSecs(Math.floor(e.currentPosition / 1000));
            });
            console.log('Recording started:', result);
        } catch (err) {
            console.error('Start record error:', err);
            setIsRecording(false);
        }
    };

    const onStopRecord = async () => {
        try {
            const recorder = getRecorder();
            if (!recorder) return;
            const result = await recorder.stopRecorder();
            recorder.removeRecordBackListener();
            setIsRecording(false);
            setRecordTime('00:00');

            if (recordSecs < 1) {
                console.log('Voice too short');
                return;
            }

            handleSendVoice(result, recordSecs);
        } catch (err) {
            console.error('Stop record error:', err);
            setIsRecording(false);
        }
    };

    // ── File open ─────────────────────────────────────────────────────────────

    const handleOpenFile = async (item: any) => {
        const url: string = item.mediaUrl ?? item.localUri;
        const fileName: string = item.fileName ?? 'file';
        const msgId: string = item._id;

        if (!url) return;

        // If it's a local file (sender preview), try to open directly
        if (url.startsWith('file://') || url.startsWith('/')) {
            try {
                await RNBlobUtil.android.actionViewIntent(
                    url.replace('file://', ''),
                    item.mimeType || 'application/octet-stream',
                );
            } catch {
                Alert.alert('Cannot Open', 'No app found to open this file.');
            }
            return;
        }

        // Remote URL — download to cache then open
        setDownloadingIds(prev => ({ ...prev, [msgId]: 'downloading' }));
        try {
            const destPath = `${RNBlobUtil.fs.dirs.CacheDir}/${fileName}`;
            const res = await RNBlobUtil.config({
                path: destPath,
                overwrite: true,
            }).fetch('GET', url);

            const savedPath = res.path();
            setDownloadingIds(prev => ({ ...prev, [msgId]: 'done' }));

            await RNBlobUtil.android.actionViewIntent(
                savedPath,
                item.mimeType || 'application/octet-stream',
            );
        } catch (err) {
            console.error('File download error:', err);
            setDownloadingIds(prev => {
                const next = { ...prev };
                delete next[msgId];
                return next;
            });
            Alert.alert('Error', 'Could not download or open this file.');
        }
    };

    const onStartPlay = async (msgId: string, url: string) => {
        try {
            if (lastPlayedId && lastPlayedId !== msgId) {
                await getRecorder()?.stopPlayer();
                setAudioStatus(prev => ({
                    ...prev,
                    [lastPlayedId]: { ...prev[lastPlayedId], isPlaying: false }
                }));
            }

            setLastPlayedId(msgId);
            const msgUrl = url.startsWith('file://') ? url : url;

            const recorder = getRecorder();
            if (!recorder) return;
            await recorder.startPlayer(msgUrl);
            recorder.addPlayBackListener((e: any) => {
                setAudioStatus(prev => ({
                    ...prev,
                    [msgId]: {
                        isPlaying: true,
                        currentPosition: e.currentPosition,
                        duration: e.duration,
                    }
                }));

                if (e.currentPosition === e.duration) {
                    getRecorder()?.stopPlayer();
                    setAudioStatus(prev => ({
                        ...prev,
                        [msgId]: { ...prev[msgId], isPlaying: false, currentPosition: 0 }
                    }));
                }
            });
        } catch (err) {
            console.error('Play error:', err);
        }
    };

    const onPausePlay = async (msgId: string) => {
        try {
            await getRecorder()?.pausePlayer();
            setAudioStatus(prev => ({
                ...prev,
                [msgId]: { ...prev[msgId], isPlaying: false }
            }));
        } catch (err) {
            console.error('Pause error:', err);
        }
    };

    const onStopPlay = async (msgId: string) => {
        try {
            const recorder = getRecorder();
            if (recorder) {
                await recorder.stopPlayer();
                recorder.removePlayBackListener();
            }
            setAudioStatus(prev => ({
                ...prev,
                [msgId]: { ...prev[msgId], isPlaying: false, currentPosition: 0 }
            }));
        } catch (err) {
            console.error('Stop play error:', err);
        }
    };

    // ── Resolve thumbnail ─────────────────────────────────────────────────────

    const resolveImageSource = (item: any): { uri: string } | undefined => {
        if (item.contentType === 'video') {
            if (item.thumbnailUri) return { uri: item.thumbnailUri as string };
            if (item.thumbnailUrl) return { uri: item.thumbnailUrl as string };
            return undefined;
        }
        if (item.localUri) return { uri: item.localUri as string };
        if (item.mediaUrl) return { uri: item.mediaUrl as string };
        return undefined;
    };

    // ── Render helpers ────────────────────────────────────────────────────────

    const renderFileBubble = (item: any, isMe: boolean) => {
        const { icon, color } = fileIconInfo(item.fileName ?? '', item.mimeType);
        const isUploading = item.uploading === true;
        const progress: number = item.uploadProgress ?? 0;
        const dlState = downloadingIds[item._id];

        return (
            <TouchableOpacity
                style={[
                    styles.fileBubble,
                    isMe ? styles.fileBubbleMe : styles.fileBubbleThem,
                ]}
                activeOpacity={isUploading ? 1 : 0.75}
                onPress={() => !isUploading && handleOpenFile(item)}>

                {/* Left: Icon */}
                <View style={[styles.fileIconCircle, { backgroundColor: color + '22' }]}>
                    <Icon name={icon} size={26} color={color} />
                </View>

                {/* Middle: Name + size */}
                <View style={styles.fileInfo}>
                    <Text
                        style={[
                            styles.fileNameText,
                            { color: isMe ? '#fff' : '#111827' },
                        ]}
                        numberOfLines={2}>
                        {item.fileName ?? 'File'}
                    </Text>
                    <Text
                        style={[
                            styles.fileSizeText,
                            { color: isMe ? 'rgba(255,255,255,0.7)' : '#9CA3AF' },
                        ]}>
                        {formatBytes(item.fileSize ?? 0)}
                    </Text>

                    {/* Upload progress bar */}
                    {isUploading && (
                        <View style={styles.fileProgressTrack}>
                            <View
                                style={[
                                    styles.fileProgressFill,
                                    {
                                        width: `${progress}%` as any,
                                        backgroundColor: isMe ? 'rgba(255,255,255,0.8)' : '#6366F1',
                                    },
                                ]}
                            />
                        </View>
                    )}
                </View>

                {/* Right: Action icon */}
                <View style={styles.fileAction}>
                    {isUploading ? (
                        <View style={styles.uploadingPctWrapper}>
                            <Text style={[
                                styles.uploadingPctText,
                                { color: isMe ? '#fff' : '#6366F1' },
                            ]}>
                                {progress}%
                            </Text>
                        </View>
                    ) : dlState === 'downloading' ? (
                        <ActivityIndicator size="small" color={isMe ? '#fff' : '#6366F1'} />
                    ) : (
                        <View style={[
                            styles.openBtn,
                            { backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : color + '22' },
                        ]}>
                            <Icon
                                name="open-outline"
                                size={16}
                                color={isMe ? '#fff' : color}
                            />
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    const renderAudioBubble = (item: any, isMe: boolean) => {
        const audioUrl = item.mediaUrl || item.localUri;
        const status = audioStatus[item._id] || {
            isPlaying: false,
            currentPosition: 0,
            duration: item.metadata?.duration ? item.metadata.duration * 1000 : 0
        };
        const isUploading = item.uploading === true;
        const progress = item.uploadProgress ?? 0;

        const recorder = getRecorder();
        const currentPosStr = recorder?.mmssss(Math.floor(status.currentPosition)) || '00:00';
        const durationStr = recorder?.mmssss(Math.floor(status.duration)) || '00:00';

        const playProgress = status.duration > 0 ? (status.currentPosition / status.duration) * 100 : 0;

        return (
            <View style={[styles.audioBubble, isMe ? styles.audioBubbleMe : styles.audioBubbleThem]}>
                <TouchableOpacity
                    onPress={() => status.isPlaying ? onPausePlay(item._id) : onStartPlay(item._id, audioUrl)}
                    style={styles.audioPlayButton}
                    disabled={isUploading}
                >
                    <Icon
                        name={status.isPlaying ? 'pause' : 'play'}
                        size={24}
                        color={isMe ? '#fff' : '#6366F1'}
                    />
                </TouchableOpacity>

                <View style={styles.audioContent}>
                    <View style={styles.audioTrackContainer}>
                        <View style={[styles.audioTrack, { backgroundColor: isMe ? 'rgba(255,255,255,0.3)' : '#E5E7EB' }]}>
                            <View style={[styles.audioProgressFill, { width: `${playProgress}%`, backgroundColor: isMe ? '#fff' : '#6366F1' }]} />
                        </View>
                    </View>
                    <View style={styles.audioMeta}>
                        <Text style={[styles.audioTimeText, { color: isMe ? 'rgba(255,255,255,0.8)' : '#6B7280' }]}>
                            {status.isPlaying ? currentPosStr : durationStr}
                        </Text>
                        {isUploading && (
                            <Text style={[styles.audioTimeText, { color: isMe ? 'rgba(255,255,255,0.8)' : '#6366F1' }]}>
                                {progress}%
                            </Text>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    const renderCallLogBubble = (item: any, isMe: boolean) => {
        const isMissed = item.content?.includes('MISSED');
        const isCancelled = item.content?.includes('CANCELLED');
        const isDeclined = item.content?.includes('DECLINED');
        const isVideo = item.content?.includes('Video');
        const duration = item.metadata?.duration;

        let statusTitle = '';
        let statusIcon = isVideo ? 'videocam' : 'call';
        let iconColor = '#6B7280';
        let circleBg = '#F3F4F6';

        if (isMissed) {
            statusTitle = isMe ? 'No answer' : 'Missed call';
            iconColor = isMe ? '#6B7280' : '#EF4444';
            circleBg = isMe ? '#F3F4F6' : '#FEE2E2';
            statusIcon = isMe ? (isVideo ? 'videocam-outline' : 'call-outline') : (isVideo ? 'videocam' : 'call');
        } else if (isCancelled || isDeclined) {
            statusTitle = isMe ? 'Cancelled call' : 'Declined call';
            statusIcon = isVideo ? 'videocam-off-outline' : 'call-outline';
        } else {
            statusTitle = isMe ? 'Outgoing call' : 'Incoming call';
            statusIcon = isMe
                ? (isVideo ? 'arrow-redo-outline' : 'arrow-up-outline')
                : (isVideo ? 'arrow-undo-outline' : 'arrow-down-outline');
            if (isMe) iconColor = '#6366F1';
            else iconColor = '#10B981';
        }

        return (
            <View style={[styles.callLogBubble, isMissed && !isMe && styles.callLogMissed]}>
                <View style={[styles.callLogIconContainer, { backgroundColor: circleBg }]}>
                    <Icon name={statusIcon as any} size={22} color={iconColor} />
                </View>

                <View style={styles.callLogInfo}>
                    <Text style={[styles.callLogTitle, isMissed && !isMe && { color: '#EF4444' }]}>
                        {statusTitle}
                    </Text>
                    <View style={styles.callLogMetaRow}>
                        <Text style={styles.callLogTypeLabel}>
                            {isVideo ? 'Video' : 'Audio'}
                        </Text>
                        {duration > 0 && (
                            <>
                                <View style={styles.callLogDot} />
                                <Text style={styles.callLogDuration}>
                                    {Math.floor(duration / 60)}m {duration % 60}s
                                </Text>
                            </>
                        )}
                    </View>
                </View>

                <View style={styles.callLogDivider} />

                <TouchableOpacity
                    style={styles.callLogCallbackBtn}
                    onPress={() => initiateCall(otherUserId, isVideo ? 'video' : 'audio', otherUser?.name, otherUser?.profileImage)}
                >
                    <Icon name={isVideo ? "videocam" : "call"} size={18} color="#6366F1" />
                </TouchableOpacity>
            </View>
        );
    };

    // ── Render message ────────────────────────────────────────────────────────

    const renderMessage = ({ item }: { item: any }) => {
        const senderId =
            typeof item.senderId === 'object' && item.senderId !== null
                ? item.senderId._id || item.senderId.id
                : item.senderId;
        const currentUserId =
            currentUser?.id ||
            (currentUser as any)?._id ||
            (currentUser as any)?.id;
        const senderIdStr = senderId ? senderId.toString() : null;
        const currentIdStr = currentUserId ? currentUserId.toString() : null;
        const isMe = !!(senderIdStr && currentIdStr && senderIdStr === currentIdStr);

        const imgSrc = resolveImageSource(item);
        const isUploading = item.uploading === true;
        const progress: number = item.uploadProgress ?? 0;
        const videoUrl: string | undefined = item.mediaUrl ?? item.localUri;

        const renderQuotedMessage = (replyTo: any, isMe: boolean) => {
            if (!replyTo) return null;
            return (
                <View style={[
                    styles.quotedContainer,
                    isMe ? styles.quotedContainerMe : styles.quotedContainerThem
                ]}>
                    <View style={styles.quotedInner}>
                        <Text style={[styles.quotedName, isMe ? { color: '#A5B4FC' } : { color: '#6366F1' }]} numberOfLines={1}>
                            {replyTo.senderId?.name || 'User'}
                        </Text>
                        <Text style={[styles.quotedText, isMe ? { color: '#E0E7FF' } : { color: '#4B5563' }]} numberOfLines={1}>
                            {replyTo.content}
                        </Text>
                    </View>
                </View>
            );
        };

        if (item.contentType === 'call_log') {
            return (
                <View style={styles.callLogWrapper}>
                    {renderCallLogBubble(item, isMe)}
                    <Text style={styles.callLogTimestamp}>
                        {formatSafeTime(item.createdAt)}
                    </Text>
                </View>
            );
        }

        return (
            <TouchableOpacity
                onLongPress={() => handleMessageActions(item)}
                delayLongPress={500}
                activeOpacity={0.9}
                style={[
                    styles.messageBubble,
                    isMe ? styles.myMessage : styles.theirMessage,
                    (item.contentType === 'image' || item.contentType === 'video') &&
                    styles.mediaBubble,
                    item.isDeleted && { backgroundColor: isMe ? '#E5E7EB' : '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB' },
                    item.reactions && item.reactions.length > 0 && { marginBottom: 22 }
                ]}>
                {renderQuotedMessage(item.replyTo, isMe)}
                {!isMe && (
                    <Text style={styles.senderNameLabel}>{otherUser?.name}</Text>
                )}

                {/* ── File ── */}
                {item.contentType === 'file' && renderFileBubble(item, isMe)}

                {/* ── Audio ── */}
                {item.contentType === 'audio' && renderAudioBubble(item, isMe)}


                {/* ── Image ── */}
                {item.contentType === 'image' && (
                    <TouchableOpacity
                        style={styles.mediaWrapper}
                        activeOpacity={0.9}
                        onPress={() => imgSrc && openImageViewer(imgSrc.uri)}>
                        {imgSrc ? (
                            <Image
                                source={imgSrc}
                                style={styles.messageImage as any}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={styles.mediaPlaceholder}>
                                <Icon name="image-outline" size={36} color="#9CA3AF" />
                            </View>
                        )}
                        {isUploading && (
                            <View style={styles.uploadOverlay}>
                                <Text style={styles.overlayPercent}>{progress}%</Text>
                                <View style={styles.overlayTrack}>
                                    <View
                                        style={[
                                            styles.overlayFill,
                                            { width: `${progress}%` as any },
                                        ]}
                                    />
                                </View>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {/* ── Video ── */}
                {item.contentType === 'video' && (
                    <TouchableOpacity
                        style={styles.mediaWrapper}
                        activeOpacity={isUploading ? 1 : 0.85}
                        onPress={() =>
                            !isUploading && videoUrl && openVideoPlayer(videoUrl)
                        }>
                        {imgSrc ? (
                            <Image
                                source={imgSrc}
                                style={styles.messageImage as any}
                                resizeMode="cover"
                            />
                        ) : (
                            <View style={styles.mediaPlaceholder}>
                                <Icon name="film-outline" size={36} color="#9CA3AF" />
                            </View>
                        )}
                        {isUploading && (
                            <View style={styles.uploadOverlay}>
                                <Icon name="cloud-upload-outline" size={26} color="#fff" />
                                <Text style={styles.overlayPercent}>{progress}%</Text>
                                <View style={styles.overlayTrack}>
                                    <View
                                        style={[
                                            styles.overlayFill,
                                            { width: `${progress}%` as any },
                                        ]}
                                    />
                                </View>
                            </View>
                        )}
                        {!isUploading && (
                            <View style={styles.playButtonOverlay}>
                                <View style={styles.playButton}>
                                    <Icon name="play" size={22} color="#fff" />
                                </View>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {/* ── Text ── */}
                {(item.contentType === 'text' || !item.contentType) && (
                    <View>
                        <Text
                            style={[
                                styles.messageText,
                                isMe ? styles.myMessageText : styles.theirMessageText,
                                item.isDeleted && { fontStyle: 'italic', color: isMe ? 'rgba(255,255,255,0.7)' : '#9CA3AF' }
                            ]}>
                            {item.content}
                        </Text>
                        {item.isEdited && !item.isDeleted && (
                            <Text style={[
                                styles.editedLabel,
                                { color: isMe ? 'rgba(255,255,255,0.6)' : '#9CA3AF' }
                            ]}>(edited)</Text>
                        )}
                    </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4 }}>
                    <Text
                        style={[
                            styles.timestamp,
                            isMe ? styles.myTimestamp : styles.theirTimestamp,
                            item.contentType === 'file' && styles.fileTimestamp,
                        ]}>
                        {formatSafeTime(item.createdAt)}
                    </Text>

                    {isMe && !isUploading && (
                        <View style={{ marginLeft: 4 }}>
                            {item.status === 'read' ? (
                                <Icon name="checkmark-done" size={16} color="#A5B4FC" />
                            ) : (
                                <Icon name="checkmark" size={16} color="#D1D5DB" />
                            )}
                        </View>
                    )}
                </View>

                {item.reactions && item.reactions.length > 0 && (
                    <View style={[styles.reactionsWrapper, isMe ? { right: 8 } : { left: 8 }]}>
                        {renderReactions(item.reactions, isMe)}
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const renderReactions = (reactions: any[], isMe: boolean) => {
        if (!reactions || reactions.length === 0) return null;

        // Group reactions by emoji
        const grouped = reactions.reduce((acc: Record<string, number>, curr: any) => {
            acc[curr.emoji] = (acc[curr.emoji] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return (
            <View style={[styles.reactionsContainer, isMe ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                {Object.entries(grouped).map(([emoji, count]) => (
                    <View key={emoji} style={styles.reactionBadge}>
                        <Text style={styles.reactionBadgeEmoji}>{emoji}</Text>
                        {count > 1 && (
                            <Text style={styles.reactionBadgeCount}>{count}</Text>
                        )}
                    </View>
                ))}
            </View>
        );
    };

    // ── Image Viewer ─────────────────────────────────────────────────────────

    const openImageViewer = (url: string) => {
        setViewerImage(url);
        setViewerVisible(true);
    };

    const handleDownloadImage = async (url: string) => {
        if (!url) return;

        console.log('🚀 Starting image download:', url);

        if (url.startsWith('file://') || url.startsWith('/')) {
            Alert.alert('Info', 'This image is already on your device.');
            return;
        }

        // 1. Android Permission Check
        if (Platform.OS === 'android') {
            try {
                // For Android 13+ (SDK 33+), we don't need WRITE_EXTERNAL_STORAGE for adding to public folders
                // but checking it doesn't hurt for older versions.
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                    {
                        title: 'Storage Permission',
                        message: 'App needs access to your storage to download images',
                        buttonNeutral: 'Ask Me Later',
                        buttonNegative: 'Cancel',
                        buttonPositive: 'OK',
                    },
                );
                if (granted !== PermissionsAndroid.RESULTS.GRANTED && Platform.Version < 33) {
                    Alert.alert('Permission Denied', 'Cannot download image without storage permission.');
                    return;
                }
            } catch (err) {
                console.warn(err);
            }
        }

        setIsDownloadingImage(true);

        try {
            const { fs, config } = RNBlobUtil;
            const date = new Date();
            const fileName = `FlyConnect_IMG_${Math.floor(date.getTime() / 1000)}.jpg`;

            // Download to temporary cache first
            const tempPath = `${fs.dirs.CacheDir}/${fileName}`;
            console.log('📂 Downloading to temp cache:', tempPath);

            const task = config({
                fileCache: true,
                path: tempPath,
                followRedirect: true,
                timeout: 30000,
            }).fetch('GET', url);

            task.progress((received: any, total: any) => {
                const r = parseFloat(received);
                const t = parseFloat(total);
                if (t > 0) {
                    console.log(`📥 Progress: ${((r / t) * 100).toFixed(0)}%`);
                } else {
                    console.log(`📥 Received: ${r} bytes`);
                }
            });

            const res = await task;
            const statusCode = res.respInfo.status;
            console.log('✅ Download finished. Status:', statusCode);

            if (statusCode !== 200) throw new Error(`Server status ${statusCode}`);

            const downloadedPath = res.path();

            // 2. Move to truly public storage
            if (Platform.OS === 'android') {
                // Try to use a truly public Download path instead of app-scoping
                // Constructing path manually to ensure it's /storage/emulated/0/Download
                const publicDownloadDir = '/storage/emulated/0/Download';
                const exists = await fs.exists(publicDownloadDir);

                // Fallback to library provided path if manual one fails
                const targetDir = exists ? publicDownloadDir : fs.dirs.DownloadDir;
                const publicPath = `${targetDir}/${fileName}`;

                console.log('💾 Copying to public gallery path:', publicPath);

                await fs.cp(downloadedPath, publicPath);

                // Tell the OS Gallery to scan this new file
                await fs.scanFile([{ path: publicPath, mime: 'image/jpeg' }]);

                Alert.alert('Success', `Image saved to Downloads & Gallery as ${fileName}`);
            } else {
                // iOS logic
                const publicPath = `${fs.dirs.DocumentDir}/${fileName}`;
                await fs.cp(downloadedPath, publicPath);
                await RNBlobUtil.ios.openDocument(publicPath);
            }

            // Cleanup temp
            try { await fs.unlink(downloadedPath); } catch (e) { }

        } catch (error: any) {
            console.error('❌ Download error:', error);
            Alert.alert('Error', `Download failed: ${error?.message || 'Please check your internet'}`);
        } finally {
            setIsDownloadingImage(false);
            console.log('🏁 Process finished.');
        }
    };

    // ── Video Player ──────────────────────────────────────────────────────────

    const openVideoPlayer = (url: string) => {
        setVideoLoading(true);
        setVideoPaused(false);
        setVideoPlayerUrl(url);
    };

    // ── Computed ──────────────────────────────────────────────────────────────

    const isUploading = pendingMedia?.uploading === true;
    const hasMedia = pendingMedia !== null;
    const canSend = hasMedia || inputText.trim().length > 0;

    // Which icon/label to show in preview strip
    const previewType = pendingMedia?.picked.type;
    const previewIcon =
        previewType === 'file'
            ? fileIconInfo(
                pendingMedia?.picked.fileName ?? '',
                pendingMedia?.picked.mimeType,
            )
            : null;

    // ── Pre-render check: if we're still loading, show a loader ────────────────
    if (loadingUser) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: '#F8FAFC', flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#6366F1" />
                <Text style={{ marginTop: 10, color: '#64748B' }}>Connecting to Chat...</Text>
            </View>
        );
    }

    if (!otherUser && !loadingUser && !initialUser && !deepLinkedUserId) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: '#F8FAFC', flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#EF4444' }}>Invalid Chat Parameters</Text>
                <TouchableOpacity 
                    onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Main')} 
                    style={{ marginTop: 20, padding: 10, backgroundColor: '#6366F1', borderRadius: 8 }}
                >
                    <Text style={{ color: '#FFF' }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!otherUser) return null; // Safe guard for TS but logic-wise otherUser is loaded here.

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Main')}
                    style={styles.backButton}>
                    <Icon name="chevron-back" size={28} color="#111827" />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.headerUser}
                    onPress={() => navigation.navigate('ChatDetail', {
                        user: {
                            ...otherUser,
                            isOnline: userStatus.isOnline,
                            lastSeen: userStatus.lastSeen
                        },
                        conversationId
                    })}
                >
                    <Image
                        source={{ uri: otherUser?.profileImage }}
                        style={styles.headerAvatar as any}
                    />
                    <View>
                        <Text style={styles.headerName}>{otherUser?.name}</Text>
                        <Text style={[
                            styles.headerStatus,
                            (userStatus.isOnline || isPartnerTyping) && styles.statusOnline
                        ]}>
                            {isPartnerTyping
                                ? 'typing...'
                                : userStatus?.isOnline
                                    ? 'Online'
                                    : userStatus?.lastSeen
                                        ? `Last seen: ${formatLastSeen(userStatus.lastSeen)}`
                                        : 'Offline'
                            }
                        </Text>
                    </View>
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => initiateCall(otherUserId, 'audio', otherUser?.name, otherUser?.profileImage)}
                    >
                        <Icon name="call-outline" size={24} color="#6366F1" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => initiateCall(otherUserId, 'video', otherUser?.name, otherUser?.profileImage)}
                    >
                        <Icon name="videocam-outline" size={24} color="#6366F1" />
                    </TouchableOpacity>
                </View>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                style={styles.keyboardAvoidingStyle}>

                {/* ── Message List ── */}
                <View style={styles.messageListContainer}>
                    {loading ? (
                        <View style={styles.centerContainer}>
                            <ActivityIndicator size="large" color="#6366F1" />
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            keyExtractor={item => item._id}
                            renderItem={renderMessage}
                            inverted
                            contentContainerStyle={styles.messageList}
                            onEndReached={() =>
                                hasMore && conversationId && loadMessages(conversationId, page + 1)
                            }
                            onEndReachedThreshold={0.5}
                        />
                    )}
                </View>

                {/* ── Input Area Group ── */}
                <View style={styles.inputAreaContainer}>
                    {/* --- Editing UI --- */}
                    {editingMessage && (
                        <View style={styles.editingBar}>
                            <View style={styles.editingInfo}>
                                <Icon name="create-outline" size={16} color="#6366F1" />
                                <Text style={styles.editingText} numberOfLines={1}>
                                    Editing: {editingMessage.content}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => {
                                setEditingMessage(null);
                                setInputText('');
                            }}>
                                <Icon name="close-circle" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* --- Replying UI --- */}
                    {replyingToMessage && (
                        <View style={styles.replyingBar}>
                            <View style={styles.replyingInfo}>
                                <Icon name="arrow-undo" size={16} color="#6366F1" />
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                    <Text style={styles.replyingToName}>
                                        Replying to {replyingToMessage.senderId?.name || otherUser?.name}
                                    </Text>
                                    <Text style={styles.replyingText} numberOfLines={1}>
                                        {replyingToMessage.content}
                                    </Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setReplyingToMessage(null)}>
                                <Icon name="close-circle" size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.inputContainer}>
                        {/* Preview Strip (Now inside container) */}
                        {pendingMedia && (
                            <View style={styles.previewStrip}>
                                <View style={styles.previewThumbWrapper}>
                                    {previewType === 'file' && previewIcon ? (
                                        <View
                                            style={[
                                                styles.previewThumb,
                                                {
                                                    backgroundColor:
                                                        previewIcon.color + '22',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                },
                                            ]}>
                                            <Icon
                                                name={previewIcon.icon}
                                                size={24}
                                                color={previewIcon.color}
                                            />
                                        </View>
                                    ) : previewType === 'image' ||
                                        pendingMedia.picked.thumbnailUri ? (
                                        <Image
                                            source={{
                                                uri:
                                                    previewType === 'video'
                                                        ? pendingMedia.picked
                                                            .thumbnailUri
                                                        : pendingMedia.picked.localUri,
                                            }}
                                            style={styles.previewThumb}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <View
                                            style={[
                                                styles.previewThumb,
                                                {
                                                    backgroundColor: '#F3F4F6',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                },
                                            ]}>
                                            <Icon
                                                name="film-outline"
                                                size={22}
                                                color="#9CA3AF"
                                            />
                                        </View>
                                    )}
                                    {previewType === 'video' && (
                                        <View style={styles.videoBadge}>
                                            <Icon
                                                name="videocam"
                                                size={10}
                                                color="#fff"
                                            />
                                        </View>
                                    )}
                                </View>

                                <View style={styles.previewInfo}>
                                    <Text style={styles.previewFileName} numberOfLines={1}>
                                        {pendingMedia.picked.fileName}
                                    </Text>
                                    <Text style={styles.previewFileMeta}>
                                        {previewType === 'image'
                                            ? 'Image'
                                            : previewType === 'video'
                                                ? 'Video'
                                                : 'File'}{' '}
                                        · {formatBytes(pendingMedia.picked.fileSize)}
                                    </Text>
                                    {isUploading && (
                                        <View style={styles.previewProgressRow}>
                                            <View style={styles.previewProgressTrack}>
                                                <Animated.View
                                                    style={[
                                                        styles.previewProgressFill,
                                                        {
                                                            width: progressAnim.interpolate(
                                                                {
                                                                    inputRange: [0, 100],
                                                                    outputRange: [
                                                                        '0%',
                                                                        '100%',
                                                                    ],
                                                                },
                                                            ),
                                                        },
                                                    ]}
                                                />
                                            </View>
                                            <Text style={styles.previewProgressPct}>
                                                {pendingMedia.progress}%
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {!isUploading && (
                                    <TouchableOpacity
                                        onPress={handleCancelMedia}
                                        style={styles.cancelMediaBtn}>
                                        <Icon
                                            name="close-circle"
                                            size={22}
                                            color="#EF4444"
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        <View style={styles.inputRow}>
                            {/* Attachment Toggle */}
                            <TouchableOpacity
                                style={[
                                    styles.attachButton,
                                    hasMedia && styles.attachButtonDisabled,
                                    showAttachMenu && styles.attachButtonActive,
                                ]}
                                onPress={() => setShowAttachMenu(!showAttachMenu)}
                                disabled={hasMedia}>
                                <Icon
                                    name={showAttachMenu ? "close" : "add"}
                                    size={24}
                                    color={hasMedia ? '#D1D5DB' : '#6366F1'}
                                />
                            </TouchableOpacity>

                            {isRecording ? (
                                <View style={styles.recordingOverlay}>
                                    <Animated.View style={[styles.recordingDot, { opacity: progressAnim.interpolate({ inputRange: [0, 50, 100], outputRange: [1, 0.3, 1] }) }]} />
                                    <Text style={styles.recordingText}>Recording {recordTime}</Text>
                                </View>
                            ) : (
                                <TextInput
                                    style={[styles.input, hasMedia && styles.inputDisabled]}
                                    placeholder={
                                        hasMedia
                                            ? 'Press send to share…'
                                            : 'Type a message...'
                                    }
                                    placeholderTextColor={hasMedia ? '#C0C5CF' : '#9CA3AF'}
                                    value={inputText}
                                    onChangeText={(text) => {
                                        setInputText(text);
                                        // Emit typing event
                                        if (conversationId) {
                                            socket.emit('typing', {
                                                conversationId,
                                                receiverId: (otherUser as any)?._id || (otherUser as any)?.id,
                                                isTyping: text.length > 0
                                            });

                                            // Reset typing indicator after 3 seconds of inactivity
                                            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                            typingTimeoutRef.current = setTimeout(() => {
                                                socket.emit('typing', {
                                                    conversationId,
                                                    receiverId: (otherUser as any)?._id || (otherUser as any)?.id,
                                                    isTyping: false
                                                });
                                            }, 3000);
                                        }
                                    }}
                                    multiline
                                    editable={!hasMedia}
                                />
                            )}

                            {canSend ? (
                                <TouchableOpacity
                                    style={[
                                        styles.sendButton,
                                        isUploading && styles.sendButtonDisabled,
                                    ]}
                                    onPress={handleSendMessage}
                                    disabled={isUploading}>
                                    {isUploading ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : (
                                        <Icon name="send" size={18} color="#FFFFFF" />
                                    )}
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={[styles.sendButton, isRecording && { backgroundColor: '#EF4444' }]}
                                    onPressIn={onStartRecord}
                                    onPressOut={onStopRecord}
                                >
                                    <Icon name={isRecording ? "mic" : "mic-outline"} size={22} color="#fff" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>

            {/* ── Video Player Modal ── */}
            <Modal
                visible={videoPlayerUrl !== null}
                animationType="fade"
                statusBarTranslucent
                onRequestClose={() => setVideoPlayerUrl(null)}>
                <View style={styles.playerContainer}>
                    <StatusBar barStyle="light-content" backgroundColor="#000" />
                    <Video
                        source={{ uri: videoPlayerUrl ?? '' }}
                        style={styles.videoPlayer}
                        resizeMode="contain"
                        paused={videoPaused}
                        onLoadStart={() => setVideoLoading(true)}
                        onLoad={() => setVideoLoading(false)}
                        onError={e => console.error('Video error:', e)}
                        controls
                        repeat={false}
                    />
                    {videoLoading && (
                        <View style={styles.playerLoader}>
                            <ActivityIndicator size="large" color="#FFFFFF" />
                        </View>
                    )}
                    <TouchableOpacity
                        style={styles.playerCloseBtn}
                        onPress={() => setVideoPlayerUrl(null)}>
                        <View style={styles.playerCloseBg}>
                            <Icon name="close" size={22} color="#FFFFFF" />
                        </View>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* ── Attachment Options Popup ── */}
            <Modal
                visible={showAttachMenu}
                transparent
                animationType="fade"
                onRequestClose={() => setShowAttachMenu(false)}>
                <TouchableWithoutFeedback onPress={() => setShowAttachMenu(false)}>
                    <View style={styles.attachMenuOverlay}>
                        <View style={styles.attachMenuContent}>
                            <Text style={styles.attachMenuTitle}>Share Media</Text>

                            <View style={styles.attachOptionsRow}>
                                <TouchableOpacity
                                    style={styles.attachOptionItem}
                                    onPress={() => {
                                        setShowAttachMenu(false);
                                        handlePickMedia('image');
                                    }}>
                                    <View style={[styles.attachOptionIcon, { backgroundColor: '#6366F1' }]}>
                                        <Icon name="image" size={24} color="#fff" />
                                    </View>
                                    <Text style={styles.attachOptionText}>Gallery</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.attachOptionItem}
                                    onPress={() => {
                                        setShowAttachMenu(false);
                                        handlePickMedia('video');
                                    }}>
                                    <View style={[styles.attachOptionIcon, { backgroundColor: '#8B5CF6' }]}>
                                        <Icon name="videocam" size={24} color="#fff" />
                                    </View>
                                    <Text style={styles.attachOptionText}>Video</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.attachOptionItem}
                                    onPress={() => {
                                        setShowAttachMenu(false);
                                        handlePickMedia('file');
                                    }}>
                                    <View style={[styles.attachOptionIcon, { backgroundColor: '#10B981' }]}>
                                        <Icon name="document" size={24} color="#fff" />
                                    </View>
                                    <Text style={styles.attachOptionText}>Files</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                style={styles.attachMenuCloseBtn}
                                onPress={() => setShowAttachMenu(false)}>
                                <Text style={styles.attachMenuCloseText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* ── Image Viewer Modal ── */}
            {viewerImage && (
                <ImageView
                    images={[{ uri: viewerImage }]}
                    imageIndex={0}
                    visible={viewerVisible}
                    onRequestClose={() => setViewerVisible(false)}
                    HeaderComponent={() => (
                        <SafeAreaView style={styles.viewerHeader}>
                            <TouchableOpacity
                                style={styles.viewerHeaderBtn}
                                onPress={() => setViewerVisible(false)}>
                                <Icon name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.viewerHeaderBtn}
                                onPress={() => handleDownloadImage(viewerImage)}>
                                {isDownloadingImage ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Icon name="download-outline" size={24} color="#fff" />
                                )}
                            </TouchableOpacity>
                        </SafeAreaView>
                    )}
                />
            )}
            {/* ── Custom Action Sheet (Message Options) ── */}
            <Modal
                visible={actionSheetVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setActionSheetVisible(false)}>
                <TouchableWithoutFeedback onPress={() => setActionSheetVisible(false)}>
                    <View style={styles.actionSheetOverlay}>
                        <View style={styles.actionSheetContent}>
                            <View style={styles.actionSheetHandle} />
                            <View style={styles.reactionRow}>
                                {EMOJIS.map((emoji) => (
                                    <TouchableOpacity
                                        key={emoji}
                                        style={styles.reactionBtn}
                                        onPress={() => handleReaction(emoji)}>
                                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <View style={styles.actionSheetDivider} />

                            <TouchableOpacity
                                style={styles.actionItem}
                                onPress={handleReplyAction}>
                                <View style={[styles.actionIconBg, { backgroundColor: '#F3F4F6' }]}>
                                    <Icon name="arrow-undo-outline" size={22} color="#4B5563" />
                                </View>
                                <Text style={styles.actionText}>Reply</Text>
                            </TouchableOpacity>

                            {((typeof selectedMessage?.senderId === 'object' ? selectedMessage?.senderId._id : selectedMessage?.senderId)?.toString() === currentUserId?.toString()) && (
                                <>
                                    <TouchableOpacity
                                        style={styles.actionItem}
                                        onPress={handleEditAction}>
                                        <View style={[styles.actionIconBg, { backgroundColor: '#EEF2FF' }]}>
                                            <Icon name="create-outline" size={22} color="#6366F1" />
                                        </View>
                                        <Text style={styles.actionText}>Edit Message</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.actionItem}
                                        onPress={() => {
                                            setActionSheetVisible(false);
                                            setConfirmDeleteVisible(true);
                                        }}>
                                        <View style={[styles.actionIconBg, { backgroundColor: '#FEF2F2' }]}>
                                            <Icon name="trash-outline" size={22} color="#EF4444" />
                                        </View>
                                        <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete for Everyone</Text>
                                    </TouchableOpacity>
                                </>
                            )}

                            <TouchableOpacity
                                style={[styles.actionItem, { marginTop: 8 }]}
                                onPress={() => setActionSheetVisible(false)}>
                                <View style={[styles.actionIconBg, { backgroundColor: '#F3F4F6' }]}>
                                    <Icon name="close" size={22} color="#4B5563" />
                                </View>
                                <Text style={styles.actionText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* ── Custom Delete Confirmation ── */}
            <Modal
                visible={confirmDeleteVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setConfirmDeleteVisible(false)}>
                <View style={styles.confirmOverlay}>
                    <View style={styles.confirmBox}>
                        <View style={styles.confirmIconCircle}>
                            <Icon name="alert-circle" size={40} color="#EF4444" />
                        </View>
                        <Text style={styles.confirmTitle}>Unsend Message?</Text>
                        <Text style={styles.confirmDesc}>
                            Are you sure you want to delete this message? This action cannot be undone.
                        </Text>
                        <View style={styles.confirmButtons}>
                            <TouchableOpacity
                                style={styles.confirmCancelBtn}
                                onPress={() => setConfirmDeleteVisible(false)}>
                                <Text style={styles.confirmCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.confirmDeleteBtn}
                                onPress={confirmDeleteMessage}>
                                <Text style={styles.confirmDeleteText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    backButton: { padding: 5, marginRight: 10 },
    headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    headerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
    headerName: { fontSize: 16, fontWeight: '700', color: '#111827' },
    headerStatus: { fontSize: 12, color: '#6B7280' },
    statusOnline: { color: '#10B981', fontWeight: '600' },
    offlineStatus: { color: '#9CA3AF' },
    headerActions: { flexDirection: 'row' },
    iconButton: { padding: 8, marginLeft: 5 },

    // List
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    messageList: { paddingHorizontal: 15, paddingVertical: 20 },

    // Bubble
    messageBubble: {
        maxWidth: '82%',
        padding: 12,
        borderRadius: 18,
        marginBottom: 10,
    },
    myMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#6366F1',
        borderBottomRightRadius: 4,
    },
    theirMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#FFFFFF',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    mediaBubble: { padding: 4, width: 240, height: 190 },
    messageText: { fontSize: 15, lineHeight: 20 },
    myMessageText: { color: '#FFFFFF' },
    theirMessageText: { color: '#1F2937' },
    timestamp: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    reactionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        marginBottom: 15,
    },
    reactionBtn: {
        padding: 5,
    },
    reactionEmoji: {
        fontSize: 26,
    },
    actionSheetDivider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginVertical: 10,
    },
    reactionsWrapper: {
        position: 'absolute',
        bottom: -12,
        zIndex: 10,
    },
    reactionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    reactionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 12,
        marginRight: 4,
        // Premium shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 1.5,
        elevation: 3,
        borderWidth: 1.5,
        borderColor: '#F3F4F6',
    },
    reactionBadgeEmoji: {
        fontSize: 12,
    },
    reactionBadgeCount: {
        fontSize: 10,
        fontWeight: '700',
        color: '#4B5563',
        marginLeft: 2,
    },
    myTimestamp: { color: '#D1D5DB' },
    theirTimestamp: { color: '#9CA3AF' },
    fileTimestamp: { marginTop: 6 },
    senderNameLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6366F1',
        marginBottom: 2,
    },

    // Media wrapper
    mediaWrapper: {
        width: '100%',
        height: '86%',
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
    },
    messageImage: { width: '100%', height: '100%' },
    mediaPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 14,
    },

    // Upload overlay
    uploadOverlay: {
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
    },
    overlayPercent: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
    overlayTrack: {
        width: '80%',
        height: 5,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 4,
        overflow: 'hidden',
    },
    overlayFill: { height: '100%', backgroundColor: '#A5B4FC', borderRadius: 4 },

    // Play button
    playButtonOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    playButton: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 4,
    },

    // ── File bubble ───────────────────────────────────────────────────────────
    fileBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minWidth: 220,
        maxWidth: 280,
        gap: 10,
    },
    fileBubbleMe: { backgroundColor: 'transparent' },
    fileBubbleThem: { backgroundColor: 'transparent' },
    fileIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    fileInfo: { flex: 1 },
    fileNameText: {
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 18,
    },
    fileSizeText: { fontSize: 11, marginTop: 2 },
    fileProgressTrack: {
        marginTop: 6,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    fileProgressFill: { height: '100%', borderRadius: 2 },
    fileAction: { justifyContent: 'center', alignItems: 'center' },
    uploadingPctWrapper: {},
    uploadingPctText: { fontSize: 12, fontWeight: '700' },
    openBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // Preview strip
    previewStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 12,
    },
    previewThumbWrapper: { position: 'relative' },
    previewThumb: {
        width: 56,
        height: 56,
        borderRadius: 10,
        backgroundColor: '#F3F4F6',
    },
    videoBadge: {
        position: 'absolute',
        bottom: 3,
        right: 3,
        backgroundColor: '#6366F1',
        borderRadius: 6,
        paddingHorizontal: 4,
        paddingVertical: 2,
    },
    previewInfo: { flex: 1 },
    previewFileName: {
        fontSize: 13,
        fontWeight: '600',
        color: '#111827',
    },
    previewFileMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
    previewProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 8,
    },
    previewProgressTrack: {
        flex: 1,
        height: 5,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        overflow: 'hidden',
    },
    previewProgressFill: {
        height: '100%',
        backgroundColor: '#6366F1',
        borderRadius: 4,
    },
    previewProgressPct: {
        fontSize: 11,
        fontWeight: '700',
        color: '#6366F1',
        minWidth: 32,
        textAlign: 'right',
    },
    cancelMediaBtn: { padding: 4 },

    keyboardAvoidingStyle: {
        flex: 1,
    },
    messageListContainer: {
        flex: 1,
    },
    inputAreaContainer: {
        width: '100%',
    },
    // Input group (Vertical: Preview Top, Input Bottom)
    inputContainer: {
        backgroundColor: '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        paddingBottom: Platform.OS === 'ios' ? 20 : 0,
        width: '100%',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 10,
    },
    attachButton: {
        padding: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        marginRight: 6,
    },
    attachButtonDisabled: { backgroundColor: '#F9FAFB', opacity: 0.5 },
    attachButtonActive: { backgroundColor: '#E0E7FF' },
    input: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        paddingTop: 8,
        maxHeight: 100,
        fontSize: 15,
        color: '#1F2937',
    },
    inputDisabled: { backgroundColor: '#F0F0F5', color: '#9CA3AF' },
    sendButton: {
        padding: 11,
        backgroundColor: '#6366F1',
        borderRadius: 12,
        marginLeft: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: { backgroundColor: '#C7D2FE' },

    // Video player
    playerContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoPlayer: { width: SCREEN_W, height: SCREEN_H },
    playerLoader: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playerCloseBtn: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 56 : 36,
        right: 20,
        zIndex: 10,
    },
    playerCloseBg: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Attachment Menu Styles ──
    attachMenuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    attachMenuContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        alignItems: 'center',
    },
    attachMenuTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 20,
    },
    attachOptionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 10,
        marginBottom: 20,
    },
    attachOptionItem: {
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    attachOptionIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    attachOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
    },
    attachMenuCloseBtn: {
        width: '100%',
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        marginTop: 10,
    },
    attachMenuCloseText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#4B5563',
    },

    // ── Viewer Header ──
    viewerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 0 : 40,
        width: '100%',
        zIndex: 100,
    },
    viewerHeaderBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Audio Message Styles ──
    audioBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        minWidth: 180,
    },
    audioBubbleMe: {
        backgroundColor: 'transparent',
    },
    audioBubbleThem: {
        backgroundColor: 'transparent',
    },
    audioPlayButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    audioContent: {
        flex: 1,
        justifyContent: 'center',
    },
    audioTrackContainer: {
        height: 4,
        justifyContent: 'center',
    },
    audioTrack: {
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
    },
    audioProgressFill: {
        height: '100%',
        borderRadius: 2,
    },
    audioMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    audioTimeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    recordingOverlay: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        borderRadius: 20,
        paddingHorizontal: 12,
        height: 40,
    },
    recordingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#EF4444',
        marginRight: 8,
    },
    recordingText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#EF4444',
    },

    // ── Edit & Delete Styles ──
    editedLabel: {
        fontSize: 10,
        alignSelf: 'flex-end',
        marginTop: 1,
        fontStyle: 'italic',
    },
    editingBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    editingInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 8,
    },
    editingText: {
        fontSize: 13,
        color: '#6366F1',
        fontWeight: '600',
    },

    // ── Action Sheet Styles ──
    actionSheetOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    actionSheetContent: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    },
    actionSheetHandle: {
        width: 40,
        height: 5,
        backgroundColor: '#E5E7EB',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    actionSheetTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#9CA3AF',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 20,
        textAlign: 'center',
    },
    actionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 16,
    },
    actionIconBg: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },

    // ── Confirm Modal Styles ──
    confirmOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    confirmBox: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
    },
    confirmIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FEF2F2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    confirmTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 10,
    },
    confirmDesc: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    confirmButtons: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    confirmCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
    },
    confirmCancelText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#4B5563',
    },
    confirmDeleteBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: '#EF4444',
        alignItems: 'center',
    },
    confirmDeleteText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    // ── Replying UI Styles ──
    replyingBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        borderLeftWidth: 4,
        borderLeftColor: '#6366F1',
    },
    replyingInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    replyingToName: {
        fontSize: 12,
        fontWeight: '700',
        color: '#6366F1',
    },
    replyingText: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    // ── Quoted Message Styles (Inside Bubble) ──
    quotedContainer: {
        borderRadius: 8,
        padding: 8,
        marginBottom: 8,
        borderLeftWidth: 3,
    },
    quotedContainerMe: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderLeftColor: '#A5B4FC',
    },
    quotedContainerThem: {
        backgroundColor: '#F3F4F6',
        borderLeftColor: '#6366F1',
    },
    quotedInner: {
        flexDirection: 'column',
    },
    quotedName: {
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 2,
    },
    quotedText: {
        fontSize: 12,
        lineHeight: 16,
    },
    // ── Call Log Styles ──
    callLogBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        maxWidth: 240,
    },
    callLogMissed: {
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FEE2E2',
    },
    callLogIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    callLogInfo: {
        flex: 1,
    },
    callLogTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#374151',
    },
    callLogMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    callLogTypeLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
    },
    callLogDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#D1D5DB',
        marginHorizontal: 6,
    },
    callLogDuration: {
        fontSize: 12,
        color: '#6B7280',
    },
    callLogDivider: {
        width: 1,
        height: 24,
        backgroundColor: '#E5E7EB',
        marginHorizontal: 12,
    },
    callLogCallbackBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#EEF2FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    callLogWrapper: {
        width: '100%',
        alignItems: 'center',
        marginVertical: 12,
    },
    callLogTimestamp: {
        fontSize: 10,
        color: '#9CA3AF',
        marginTop: 4,
    },
});

export default ChatScreen;
