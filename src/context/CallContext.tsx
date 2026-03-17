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

interface CallUser {
  id: string;
  name: string;
  profileImage?: string;
}

interface CallSession {
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
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const { socket } = useSocket();
  const { user } = useProfile();

  const currentUserId = (user as any)?._id || (user as any)?.id;

  // Handlers for Socket Events
  useEffect(() => {
    if (!socket || !user) return;

    // 1. Incoming Call
    socket.on('call:incoming', (data: any) => {
      console.log('📞 [CallContext] Incoming call:', data.callId);
      const mappedCaller = {
        id: data.caller.id || data.caller._id,
        name: data.caller.name,
        profileImage: data.caller.profileImage
      };
      setCallSession({
        ...data,
        caller: mappedCaller,
        receiver: {
          id: currentUserId,
          name: user.name,
          profileImage: user.profileImage
        },
        status: 'INCOMING',
      });
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

  // Navigate when call state changes
  useEffect(() => {
    if (callSession?.status === 'INCOMING') {
      navigate('IncomingCall', {});
    } else if (callSession?.status === 'ACTIVE' || callSession?.status === 'OUTGOING') {
      navigate('ActiveCall', {});
    }
  }, [callSession?.status]);

  const initiateCall = useCallback((receiverId: string, type: 'audio' | 'video', name: string, image?: string) => {
    if (!socket) return;
    console.log(`📞 [CallContext] Initiating ${type} call to ${receiverId}`);
    socket.emit('call:request', { receiverId, type });
    
    setCallSession({
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
  }, [socket, user, currentUserId]);

  const acceptCall = useCallback(() => {
    if (!socket || !callSession) return;
    socket.emit('call:accept', { 
        callId: callSession.callId, 
        callerId: callSession.caller.id 
    });
    setCallSession(prev => prev ? { ...prev, status: 'ACTIVE' } : null);
  }, [socket, callSession]);

  const declineCall = useCallback(() => {
    if (!socket || !callSession) return;
    socket.emit('call:decline', { 
        callId: callSession.callId, 
        callerId: callSession.caller.id 
    });
    setCallSession(null);
  }, [socket, callSession]);

  const cancelCall = useCallback(() => {
    if (!socket || !callSession) return;
    socket.emit('call:cancel', { 
        callId: callSession.callId, 
        receiverId: callSession.receiver.id
    });
    setCallSession(null);
  }, [socket, callSession]);

  const endCall = useCallback(() => {
    if (!socket || !callSession) return;
    const otherUserId = callSession.caller.id === currentUserId 
        ? callSession.receiver.id 
        : callSession.caller.id;

    socket.emit('call:end', { 
        callId: callSession.callId, 
        otherUserId 
    });
    setCallSession(null);
  }, [socket, callSession, currentUserId]);

  return (
    <CallContext.Provider value={{ 
        callSession, 
        initiateCall, 
        acceptCall, 
        declineCall, 
        cancelCall, 
        endCall 
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
