import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import AgoraUIKit from 'agora-rn-uikit';
import { useCall } from '../../context/CallContext';
import { goBack } from '../../navigation/RootNavigation';
import api from '../../services/api';

const ActiveCallScreen = () => {
  const { callSession, endCall } = useCall();
  const [token, setToken] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchToken = async () => {
      if (!callSession || callSession.status === 'IDLE' || !callSession.channelName) return;
      
      try {
        setLoading(true);
        console.log('🎫 [ActiveCallScreen] Fetching Agora token for channel:', callSession.channelName);
        const response = await api.post('/api/v1/call/generate-token', {
          channelName: callSession.channelName,
          callId: callSession.callId
        });

        if (response.data.success) {
          setToken(response.data.token);
          setAppId(response.data.appId);
        }
      } catch (error) {
        console.error('❌ [ActiveCallScreen] Token fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchToken();
  }, [callSession?.callId, callSession?.channelName]);

  // Exit if call ends
  useEffect(() => {
    if (!callSession || (callSession.status !== 'ACTIVE' && callSession.status !== 'OUTGOING')) {
      goBack();
    }
  }, [callSession?.status]);

  if (loading || !appId || !token || !callSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>
          {!callSession?.channelName ? 'Connecting to server...' : 'Joining channel...'}
        </Text>
      </View>
    );
  }

  const connectionData = {
    appId: appId,
    channel: callSession.channelName,
    token: token,
  };

  const rtcCallbacks = {
    EndCall: () => {
      console.log('📞 [ActiveCallScreen] Call ended by User');
      endCall();
    },
  };

  return (
    <View style={styles.container}>
      <AgoraUIKit 
        connectionData={connectionData} 
        rtcCallbacks={rtcCallbacks}
        settings={{
            activeSpeaker: true,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1c2c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ActiveCallScreen;
