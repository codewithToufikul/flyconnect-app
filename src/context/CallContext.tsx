import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { useSocket } from './SocketContext';
import { useProfile } from './ProfileContext';
import { navigate } from '../navigation/RootNavigation';
import CallKeepService from '../services/CallKeepService';
import NotificationService from '../services/NotificationService';
import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pendingCallActions, clearPendingCallActions } from '../services/CallActions';

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

interface CallUser {
  id: string;
  name: string;
  profileImage?: string;
}

interface CallSession {
  callUUID?: string;
  callId: string;
  channelName: string;
  caller: CallUser;
  receiver: CallUser;
  type: 'audio' | 'video';
  status: 'IDLE' | 'INCOMING' | 'OUTGOING' | 'ACTIVE';
}

interface CallContextType {
  callSession: CallSession | null;
  initiateCall: (receiverId: string, type: 'audio' | 'video', name: string, image?: string) => void;
  acceptCall: () => void;
  declineCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  isAudioActivated: boolean;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [isAudioActivated, setIsAudioActivated] = useState(false);
  const { socket } = useSocket();
  const { user } = useProfile();

  const currentUserId = (user as any)?._id || (user as any)?.id;

  const processPendingActions = useCallback(async () => {
    // We need socket and user to proceed with session set, 
    // because session depends on currentUserId and server communication.
    if (!socket || !currentUserId || !user) return;

    console.log('🔍 [CallContext] Reading pending actions from storage...');

    try {
      const storedActionStr = await AsyncStorage.getItem('@pending_call_action');
      const storedDataStr = await AsyncStorage.getItem('@pending_call_data');
      
      let finalActionData = null;

      if (storedActionStr) {
        finalActionData = JSON.parse(storedActionStr);
        console.log('🎁 [CallContext] PERSISTED ACTION FOUND:', finalActionData.action);
        await AsyncStorage.removeItem('@pending_call_action');
        await AsyncStorage.removeItem('@pending_call_data');
      } else if (storedDataStr) {
        const data = JSON.parse(storedDataStr);
        // Check if reasonably fresh (under 60 seconds for cold boot)
        const age = Date.now() - (data.timestamp || 0);
        if (age < 60000) {
           console.log('🎁 [CallContext] PERSISTED DATA FOUND (fresh):', data.callId);
           finalActionData = { action: 'tapped', ...data };
        } else {
           console.log('🗑️ [CallContext] PERSISTED DATA DISCARDED (too old):', age, 'ms');
        }
        await AsyncStorage.removeItem('@pending_call_data');
      }

      if (finalActionData) {
        const { action, callId, callerName, callerId, callUUID, callType } = finalActionData;
        console.log(`🚀 [CallContext] Initiating recovered session for ${callId} (${action})`);
        
        if (action === 'answered') {
          setCallSession({
            callUUID: callUUID || undefined,
            callId,
            channelName: `call_${callId}`,
            caller: { id: callerId || 'unknown', name: callerName || 'Someone' },
            receiver: { id: currentUserId, name: user.name, profileImage: user.profileImage },
            type: callType || 'audio',
            status: 'ACTIVE'
          });
          socket.emit('call:accept', { callId, callerId: callerId || 'unknown' });
        } else if (action === 'tapped' || action === 'incoming') { // 'tapped' is usually what we use
          setCallSession({
            callUUID: callUUID || undefined,
            callId,
            channelName: `call_${callId}`,
            caller: { id: callerId || 'unknown', name: callerName || 'Someone' },
            receiver: { id: currentUserId, name: user.name, profileImage: user.profileImage },
            type: callType || 'audio',
            status: 'INCOMING'
          });
        }
      }
    } catch (e) {
      console.error('❌ [CallContext] Storage read error:', e);
    }

    // 2. Check Memory Store (For Background -> Foreground transitions while app process stayed alive)
    if (pendingCallActions.answered && pendingCallActions.callId) {
      // ... (existing logic is fine but let's make it consistent)
      const { callId, callerName, callerId, callUUID, callType } = pendingCallActions;
      setCallSession({
        callUUID: callUUID || undefined,
        callId: callId!,
        channelName: `call_${callId}`,
        caller: { id: callerId || 'unknown', name: callerName || 'Someone' },
        receiver: { id: currentUserId, name: user.name, profileImage: user.profileImage },
        type: callType || 'audio',
        status: 'ACTIVE'
      });
      socket.emit('call:accept', { callId: callId!, callerId: callerId || 'unknown' });
      clearPendingCallActions();
    } else if (pendingCallActions.tapped && pendingCallActions.callId) {
       const { callId, callerName, callerId, callUUID, callType } = pendingCallActions;
       setCallSession({
        callUUID: callUUID || undefined,
        callId: callId!,
        channelName: `call_${callId}`,
        caller: { id: callerId || 'unknown', name: callerName || 'Someone' },
        receiver: { id: currentUserId, name: user.name, profileImage: user.profileImage },
        type: callType || 'audio',
        status: 'INCOMING'
      });
       clearPendingCallActions();
    } else if (pendingCallActions.declined && pendingCallActions.callId) {
      socket.emit('call:decline', { 
        callId: pendingCallActions.callId,
        callerId: pendingCallActions.callerId || 'unknown'
      });
      clearPendingCallActions();
    }
  }, [socket, user, currentUserId]);

  // Process actions on AppState change (background -> foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        processPendingActions();
      }
    });

    // Also run on mount
    processPendingActions();

    return () => {
      subscription.remove();
    };
  }, [processPendingActions]);

  // Handlers for Socket Events
  useEffect(() => {
    if (!socket || !user) return;

    // 1. Incoming Call
    socket.on('call:incoming', (data: any) => {
      const mappedCaller = {
        id: data.caller.id || data.caller._id,
        name: data.caller.name,
        profileImage: data.caller.profileImage
      };

      const callUUID = generateUUID();
      setIsAudioActivated(false);

      setCallSession({
        ...data,
        callUUID, // Add UUID for CallKeep
        caller: mappedCaller,
        receiver: {
          id: currentUserId,
          name: user.name,
          profileImage: user.profileImage
        },
        status: 'INCOMING',
      });

      // Show Native Call UI
      CallKeepService.displayIncomingCall(
        callUUID,
        mappedCaller.name,
        mappedCaller.name
      );

      // Emit ringing to server
      socket.emit('call:ringing', { callId: data.callId, callerId: mappedCaller.id });
    });

    // 2. Call Accepted (For Caller)
    socket.on('call:accepted', (data: { callId: string }) => {
      console.log('✅ [CallContext] Call accepted by receiver');
      setCallSession(prev => prev ? { ...prev, status: 'ACTIVE' } : null);
    });

    // 3. Call Declined/Cancelled/Ended
    const handleCallEnd = (data: { callId: string, reason?: string }) => {
      console.log('🛑 [CallContext] Call ended/declined:', data.reason || 'Terminated');
      if (callSession?.callUUID) {
        CallKeepService.endCall(callSession.callUUID);
      }
      
      // Production fix: Clear lingering notifications
      NotificationService.cancelAllCallNotifications();
      
      setCallSession(null);
    };

    socket.on('call:declined', handleCallEnd);
    socket.on('call:cancelled', handleCallEnd);
    socket.on('call:ended', handleCallEnd);

    // 4. Active Session Sync (On Reconnect)
    socket.on('call:active_session', (data: any) => {
      console.log('🔄 [CallContext] Re-syncing active call:', data.callId);
      const callerIdStr = data.callerId?._id || data.callerId?.id || data.callerId;
      const receiverIdStr = data.receiverId?._id || data.receiverId?.id || data.receiverId;
      const recId = callerIdStr === currentUserId ? receiverIdStr : currentUserId;
      
      const receiverData = data.receiverId?._id ? data.receiverId : { id: receiverIdStr, name: 'User' };

      setCallSession({
        callId: data.callId,
        channelName: data.channelName,
        caller: {
          id: callerIdStr,
          name: data.callerId?.name || 'User',
          profileImage: data.callerId?.profileImage
        },
        receiver: {
          id: receiverIdStr,
          name: receiverData.name || 'User',
          profileImage: receiverData.profileImage
        },
        type: data.type,
        status: 'ACTIVE',
      });
    });

    // 5. Call Request Sent (Confirmation to Caller)
    socket.on('call:request_sent', (data: { callId: string }) => {
      console.log('📡 [CallContext] Call request confirmed by server:', data.callId);
      setCallSession(prev => prev ? { 
        ...prev, 
        callId: data.callId,
        channelName: `call_${data.callId}`
      } : null);
    });

    // 6. Ringing
    socket.on('call:ringing', (data: { callId: string }) => {
      console.log('🔔 [CallContext] Peer phone is ringing:', data.callId);
    });

    return () => {
      socket.off('call:incoming');
      socket.off('call:accepted');
      socket.off('call:declined');
      socket.off('call:cancelled');
      socket.off('call:ended');
      socket.off('call:active_session');
      socket.off('call:request_sent');
      socket.off('call:ringing');
    };
  }, [socket, user, currentUserId]);

  // Navigate when call state changes - Enhanced with retry for cold start
  useEffect(() => {
    let timeoutId: any;
    
    const tryNavigate = () => {
      if (!callSession?.status) return;

      console.log(`🧭 [CallContext] Attempting navigation for status: ${callSession.status}`);
      
      if (callSession.status === 'INCOMING') {
        const success = navigate('IncomingCall', {});
        if (!success) {
          console.warn('⚠️ [CallContext] Navigation failed (not ready), retrying...');
          timeoutId = setTimeout(tryNavigate, 1000);
        }
      } else if (callSession.status === 'ACTIVE' || callSession.status === 'OUTGOING') {
        const success = navigate('ActiveCall', {});
        if (!success) {
           timeoutId = setTimeout(tryNavigate, 1000);
        }
      }
    };

    tryNavigate();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [callSession?.status]);

  const initiateCall = useCallback((receiverId: string, type: 'audio' | 'video', name: string, image?: string) => {
    if (!socket) return;
    console.log(`📞 [CallContext] Initiating ${type} call to ${receiverId}`);
    socket.emit('call:request', { receiverId, type });
    
    const callUUID = generateUUID();
    setIsAudioActivated(false);

    setCallSession({
        callUUID,
        callId: 'loading',
        channelName: '',
        caller: {
          id: currentUserId,
          name: user?.name || '',
          profileImage: user?.profileImage
        },
        receiver: {
          id: receiverId,
          name: name,
          profileImage: image
        },
        type,
        status: 'OUTGOING'
    });

    // Notify CallKeep about outgoing call
    CallKeepService.startCall(callUUID, name, name);
  }, [socket, user, currentUserId]);

  const acceptCall = useCallback(() => {
    if (!socket || !callSession) return;
    
    // Clear notifications immediately
    NotificationService.cancelAllCallNotifications();

    socket.emit('call:accept', { 
        callId: callSession.callId, 
        callerId: callSession.caller.id 
    });
    setCallSession(prev => prev ? { ...prev, status: 'ACTIVE' } : null);
    // Note: CallKeep answer is usually handled via callback, 
    // but if triggered from UI, we might need to notify it back if not already.
  }, [socket, callSession]);

  const declineCall = useCallback(() => {
    if (!socket || !callSession) return;

    // Clear notifications immediately
    NotificationService.cancelAllCallNotifications();

    socket.emit('call:decline', { 
        callId: callSession.callId, 
        callerId: callSession.caller.id 
    });
    if (callSession.callUUID) {
      CallKeepService.endCall(callSession.callUUID);
    }
    setCallSession(null);
  }, [socket, callSession]);

  const cancelCall = useCallback(() => {
    if (!socket || !callSession) return;

    // Clear notifications immediately
    NotificationService.cancelAllCallNotifications();

    socket.emit('call:cancel', { 
        callId: callSession.callId, 
        receiverId: callSession.receiver.id
    });
    if (callSession.callUUID) {
      CallKeepService.endCall(callSession.callUUID);
    }
    setCallSession(null);
  }, [socket, callSession]);

  const endCall = useCallback(() => {
    if (!socket || !callSession) return;

    // Clear notifications immediately
    NotificationService.cancelAllCallNotifications();

    const otherUserId = callSession.caller.id === currentUserId 
        ? callSession.receiver.id 
        : callSession.caller.id;

    socket.emit('call:end', { 
        callId: callSession.callId, 
        otherUserId 
    });
    if (callSession.callUUID) {
      CallKeepService.endCall(callSession.callUUID);
    }
    setCallSession(null);
  }, [socket, callSession, currentUserId]);

  // Initial CallKeep configuration
  useEffect(() => {
    const initCallKeep = async () => {
      await CallKeepService.setup({
        onAnswerCall: ({ callUUID }) => {
          console.log('📞 [CallKeep] Answered call:', callUUID);
          acceptCall();
          CallKeepService.backToForeground();
        },
        onEndCall: ({ callUUID }) => {
          console.log('🛑 [CallKeep] Ended call:', callUUID);
          endCall();
        },
        onActivateAudioSession: () => {
          console.log('🔊 [CallKeep] Audio Session Activated');
          setIsAudioActivated(true);
        },
        onShowIncomingCallUi: () => {
          console.log('📱 [CallKeep] Show Incoming Call UI');
          CallKeepService.backToForeground();
          // The status is already INCOMING, so navigate listener will handle it, 
          // but we can force it here too.
          navigate('IncomingCall', {});
        },
      });
    };
    initCallKeep();
  }, [acceptCall, endCall]);

  return (
    <CallContext.Provider value={{ 
        callSession, 
        initiateCall, 
        acceptCall, 
        declineCall, 
        cancelCall, 
        endCall,
        isAudioActivated
    }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
