import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Image,
  Platform,
} from 'react-native';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  IRtcEngine,
  RtcSurfaceView,
  RtcConnection,
  RemoteVideoState,
  RemoteVideoStateReason,
  AudioProfileType,
  AudioScenarioType,
} from 'react-native-agora';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { useCall } from '../../context/CallContext';
import { useProfile } from '../../context/ProfileContext';
import { goBack } from '../../navigation/RootNavigation';
import api from '../../services/api';

const { width, height } = Dimensions.get('window');

const getNumericUid = (id: string): number => {
  if (!id) return 0;
  // If it's already a numeric string, just parse it
  if (/^\d+$/.test(id)) return parseInt(id, 10);

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
};

const RINGBACK_URL = 'https://www.soundjay.com/phone_c2026/sounds/phone-calling-1b.mp3'; // Professional ringback tone URL
const RINGBACK_ID = 1;

const ActiveCallScreen = () => {
  const { callSession, endCall, isAudioActivated } = useCall();
  const { user } = useProfile();

  const [token, setToken] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Agora State
  const engine = useRef<IRtcEngine | null>(null);
  const hasExited = useRef(false);
  const isRingbackPlaying = useRef(false);
  const [isJoined, setIsJoined] = useState(false);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callSession?.type === 'video');
  const [isSpeakerOn, setIsSpeakerOn] = useState(callSession?.type === 'video'); // Default: Speaker for video, Earpiece for audio
  const [isCameraFront, setIsCameraFront] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  // Ensure we use the correct ID property
  const userId = user?.id || (user as any)?._id || (user as any)?.uid || '';

  // Identify who the "other" person is
  const isCaller = callSession?.caller.id === userId;
  const otherPerson = isCaller ? callSession?.receiver : callSession?.caller;

  const localUid = getNumericUid(userId);

  // 1. Timer Logic
  useEffect(() => {
    let interval: any;
    if (remoteUid) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [remoteUid]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${mins < 10 && hrs > 0 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;
  };

  const playRingback = useCallback(() => {
    if (engine.current && !isRingbackPlaying.current && callSession?.status === 'OUTGOING') {
      console.log('🎵 [Agora] Starting Ringback Tone...');
      engine.current.playEffect(
        RINGBACK_ID,
        RINGBACK_URL,
        -1, // Loop indefinitely
        1,  // Pitch
        0,  // Pan
        60, // Volume (0-100)
        true // Publish to remote
      );
      isRingbackPlaying.current = true;
    }
  }, [callSession?.status]);

  const stopRingback = useCallback(() => {
    if (engine.current && isRingbackPlaying.current) {
      console.log('🔇 [Agora] Stopping Ringback Tone');
      engine.current.stopEffect(RINGBACK_ID);
      isRingbackPlaying.current = false;
    }
  }, []);

  // 2. Fetch Token
  useEffect(() => {
    const fetchToken = async () => {
      // WAIT for localUid to be ready (non-zero) before fetching token and joining
      if (!callSession || !callSession.channelName || !localUid) return;

      try {
        setLoading(true);
        console.log(`🎫 [ActiveCallScreen] Fetching token for channel: ${callSession.channelName}, UID: ${localUid}`);
        const response = await api.post('/api/v1/calls/generate-token', {
          channelName: callSession.channelName,
          callId: callSession.callId,
          uid: localUid
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
  }, [callSession?.callId, callSession?.channelName, localUid]);

  // 2. Request Permissions
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await request(PERMISSIONS.ANDROID.RECORD_AUDIO);
      if (callSession?.type === 'video') {
        await request(PERMISSIONS.ANDROID.CAMERA);
      }
    } else {
      await request(PERMISSIONS.IOS.MICROPHONE);
      if (callSession?.type === 'video') {
        await request(PERMISSIONS.IOS.CAMERA);
      }
    }
  };

  // 3. Initialize Agora Engine (Only ONCE)
  useEffect(() => {
    let setupEngine = async () => {
      try {
        if (!appId) {
          console.warn('⚠️ [Agora] App ID missing - skipping init');
          return;
        }
        console.log('🏗️ [Agora] Initializing Engine...');
        await requestPermissions();
        engine.current = createAgoraRtcEngine();
        engine.current.initialize({ appId: appId });

        // Event Listeners
        engine.current.registerEventHandler({
          onJoinChannelSuccess: (connection: RtcConnection, elapsed: number) => {
            console.log('✅ [Agora] Successfully Joined Channel:', connection.channelId, 'with UID:', connection.localUid);
            setIsJoined(true);
          },
          onUserJoined: (connection: RtcConnection, uid: number) => {
            console.log('👤 [Agora] Remote User Joined with UID:', uid);
            setRemoteUid(uid);
            stopRingback(); // Stop ringback when they join
          },
          onUserOffline: (connection: RtcConnection, uid: number) => {
            console.log('👋 [Agora] Remote User Offline (reason:', uid, ')');
            setRemoteUid(null);
            // In 1-to-1, we usually end the call when the other person leaves
            setTimeout(() => {
              handleHangup();
            }, 1000);
          },
          onError: (err, msg) => {
            console.error('❌ [Agora] Engine Error:', err, msg);
          }
        });

        // Production Audio Configuration
        await engine.current.enableAudio();

        // Set optimized audio profile for communication
        await engine.current.setAudioProfile(
          AudioProfileType.AudioProfileDefault,
          AudioScenarioType.AudioScenarioDefault
        );

        // Ensure volumes are explicitly leveled
        await engine.current.adjustRecordingSignalVolume(100);
        await engine.current.adjustPlaybackSignalVolume(100);

        // Initial Routing: Video starts on speaker, Audio starts on earpiece
        const shouldBeOnSpeaker = callSession?.type === 'video';
        await engine.current.setDefaultAudioRouteToSpeakerphone(shouldBeOnSpeaker);
        await engine.current.setEnableSpeakerphone(shouldBeOnSpeaker);
        await engine.current.muteLocalAudioStream(false);

        if (callSession?.type === 'video') {
          await engine.current.enableVideo();
          await engine.current.startPreview();
        }

        await engine.current.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);

        console.log('✅ [Agora] Engine Ready');
        setIsEngineReady(true);

        // Start ringback if we're the caller and engine is ready
        if (callSession?.status === 'OUTGOING') {
          playRingback();
        }
      } catch (e) {
        console.error('❌ [Agora] Setup Error:', e);
      }
    };

    if (appId && !engine.current) {
      setupEngine();
    }

    return () => {
      if (engine.current) {
        console.log('🧹 [Agora] Releasing Engine Lifecycle');
        stopRingback();
        engine.current.leaveChannel();
        engine.current.release();
        engine.current = null;
        setIsJoined(false);
        setIsEngineReady(false);
      }
    };
  }, [appId]); // Only depend on appId

  // 4. Join Channel (When token and engine are ready)
  useEffect(() => {
    const join = async () => {
      const isAudioReady = Platform.OS === 'android' ? true : isAudioActivated;

      if (isEngineReady && engine.current && token && appId && localUid && !isJoined && isAudioReady) {
        // Check if callSession and channelName are valid before logging/joining
        if (!callSession || !callSession.channelName) {
          console.log('⏳ [Agora] Waiting for channelName to be available in session...', callSession);
          return;
        }

        console.log(`🚀 [Agora] Attempting to Join: ${callSession.channelName} | UID: ${localUid}`);
        try {
          const result = await engine.current.joinChannel(token, callSession.channelName, localUid, {
            clientRoleType: ClientRoleType.ClientRoleBroadcaster,
            publishMicrophoneTrack: true,
            publishCameraTrack: callSession.type === 'video',
            autoSubscribeAudio: true,
            autoSubscribeVideo: true,
          });
          if (result !== 0) {
            console.error('❌ [Agora] joinChannel failed with code:', result);
          }
        } catch (e) {
          console.error('❌ [Agora] Join exception:', e);
        }
      }
    };

    join();
  }, [token, appId, isJoined, localUid, isEngineReady, callSession?.channelName, callSession?.type]);

  // 5. Control Handlers
  const toggleMute = () => {
    if (engine.current) {
      engine.current.muteLocalAudioStream(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (engine.current && callSession?.type === 'video') {
      engine.current.muteLocalVideoStream(isVideoEnabled);
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const toggleSpeaker = () => {
    if (engine.current) {
      const nextState = !isSpeakerOn;
      engine.current.setEnableSpeakerphone(nextState);
      setIsSpeakerOn(nextState);
    }
  };

  const switchCamera = () => {
    if (engine.current && isVideoEnabled) {
      engine.current.switchCamera();
      setIsCameraFront(!isCameraFront);
    }
  };

  const handleHangup = useCallback(() => {
    if (hasExited.current) return;
    hasExited.current = true;

    console.log('📞 [ActiveCallScreen] Hanging up and exiting...');
    stopRingback();
    endCall();

    // Smooth exit
    setTimeout(() => {
      goBack();
    }, 100);
  }, [endCall]);

  // Exit if call ends from context
  useEffect(() => {
    if (!callSession) {
      handleHangup();
      return;
    }

    const validStates = ['ACTIVE', 'OUTGOING', 'INCOMING'];
    if (!validStates.includes(callSession.status)) {
      console.log(`⚠️ [ActiveCallScreen] Ending call due to status: ${callSession.status}`);
      handleHangup();
    }
  }, [callSession?.status, handleHangup]);

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* 1. Main View (Remote Video or Avatar) */}
      <View style={styles.videoGrid}>
        {callSession.type === 'video' && remoteUid ? (
          <RtcSurfaceView
            canvas={{ uid: remoteUid }}
            style={styles.fullVideo}
          />
        ) : (
          <View style={styles.avatarContainer}>
            <LinearGradient colors={['#1a1c2c', '#2e314e']} style={StyleSheet.absoluteFill} />
            <View style={styles.avatarGlow}>
              <Image
                source={{
                  uri: otherPerson?.profileImage ||
                    'https://i.ibb.co/mcL9L2t/f10ff70a7155e5ab666bcdd1b45b726d.jpg'
                }}
                style={styles.largeAvatar}
              />
            </View>
            <Text style={styles.remoteName}>{otherPerson?.name || 'Connecting...'}</Text>
            <Text style={styles.callDuration}>
              {remoteUid ? formatDuration(callDuration) : 'Ringing...'}
            </Text>
          </View>
        )}

        {/* 2. Local View (PIP) */}
        {callSession.type === 'video' && isJoined && isVideoEnabled && (
          <View style={styles.localVideoContainer}>
            <RtcSurfaceView
              canvas={{ uid: 0 }} // 0 for local
              style={styles.localVideo}
              zOrderMediaOverlay={true}
            />
          </View>
        )}
      </View>

      {/* 3. Control Bar */}
      <View style={styles.controlsContainer}>
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.controlsGradient}
        >
          <View style={styles.controlsRow}>
            {callSession.type === 'audio' && (
              <TouchableOpacity
                style={[styles.iconButton, !isSpeakerOn && styles.inactiveButton]}
                onPress={toggleSpeaker}
              >
                <Icon name={isSpeakerOn ? "volume-high" : "volume-low"} size={28} color="white" />
              </TouchableOpacity>
            )}

            {callSession.type === 'video' && (
              <TouchableOpacity
                style={[styles.iconButton, !isVideoEnabled && styles.inactiveButton]}
                onPress={toggleVideo}
              >
                <Icon name={isVideoEnabled ? "video" : "video-off"} size={28} color="white" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.iconButton, isMuted && styles.inactiveButton]}
              onPress={toggleMute}
            >
              <Icon name={isMuted ? "microphone-off" : "microphone"} size={28} color="white" />
            </TouchableOpacity>

            {callSession.type === 'video' && (
              <TouchableOpacity style={styles.iconButton} onPress={switchCamera}>
                <Icon name="camera-flip" size={28} color="white" />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.iconButton, styles.hangupButton]} onPress={handleHangup}>
              <Icon name="phone-hangup" size={32} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1c2c',
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
  videoGrid: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },
  fullVideo: {
    flex: 1,
  },
  localVideoContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 120,
    height: 180,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  localVideo: {
    flex: 1,
  },
  avatarContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarGlow: {
    padding: 8,
    borderRadius: 85,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 20,
  },
  largeAvatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  remoteName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10
  },
  callDuration: {
    fontSize: 18,
    color: '#A5B4FC',
    fontWeight: '600',
    letterSpacing: 1,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 150,
  },
  controlsGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  iconButton: {
    width: 55,
    height: 55,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inactiveButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.5)',
  },
  hangupButton: {
    backgroundColor: '#EF4444',
    width: 65,
    height: 65,
    borderRadius: 33,
  },
});

export default ActiveCallScreen;
