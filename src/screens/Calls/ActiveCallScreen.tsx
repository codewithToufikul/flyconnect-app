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
  BackHandler,
  Animated,
  PanResponder,
} from 'react-native';
import {
  ChannelProfileType,
  ClientRoleType,
  IRtcEngine,
  RtcSurfaceView,
  RtcConnection,
  AudioProfileType,
  AudioScenarioType,
  VideoSourceType,
  LocalVideoStreamState,
  LocalVideoStreamReason,
  LocalAudioStreamState,
  LocalAudioStreamReason,
  RemoteAudioState,
  RemoteAudioStateReason,
  AudioVolumeInfo,
  UserOfflineReasonType,
} from 'react-native-agora';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { request, PERMISSIONS } from 'react-native-permissions';
import InCallManager from 'react-native-incall-manager';
import { useCall } from '../../context/CallContext';
import { useProfile } from '../../context/ProfileContext';
import { goBack } from '../../navigation/RootNavigation';
import api from '../../services/api';
import AgoraService from '../../services/AgoraService';
import PipService from '../../services/PipService';

const { width, height } = Dimensions.get('window');

const PIP_W = 120;
const PIP_H = 180;
const INITIAL_PIP_X = width - PIP_W - 16;
const INITIAL_PIP_Y = Platform.OS === 'android' ? 36 : 56;

const getNumericUid = (id: string): number => {
  if (!id) return 1;
  if (/^\d+$/.test(id)) {
    const parsed = parseInt(id, 10);
    return parsed > 0 ? parsed : 1;
  }

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    const char = id.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const positive = Math.abs(hash);
  return positive > 0 ? positive : 1;
};

const RINGBACK_URL = 'https://www.soundjay.com/phone_c2026/sounds/phone-calling-1b.mp3';
const RINGBACK_ID = 1;

const ActiveCallScreen = () => {
  const { callSession, endCall, isAudioActivated, setIsMinimized } = useCall();
  const { user } = useProfile();

  const [token, setToken] = useState<string | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Agora State
  const engine = useRef<IRtcEngine | null>(AgoraService.getEngine());
  const hasExited = useRef(false);
  const isRingbackPlaying = useRef(false);
  const [isJoined, setIsJoined] = useState(AgoraService.getIsJoined());
  const [isEngineReady, setIsEngineReady] = useState(AgoraService.getEngine() !== null);
  const [remoteUid, setRemoteUid] = useState<number | null>(AgoraService.getRemoteUid());
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callSession?.type === 'video');
  const [isSpeakerOn, setIsSpeakerOn] = useState(callSession?.type === 'video');
  const [isCameraFront, setIsCameraFront] = useState(true);
  const [callDuration, setCallDuration] = useState(AgoraService.getElapsedDuration());
  const [isInPipMode, setIsInPipMode] = useState(false);

  // Draggable PIP mini-screen PanResponder
  const panPip = useRef(new Animated.ValueXY({ x: INITIAL_PIP_X, y: INITIAL_PIP_Y })).current;
  const panPipOffset = useRef({ x: INITIAL_PIP_X, y: INITIAL_PIP_Y });

  const pipPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onPanResponderGrant: () => {
        panPip.setOffset(panPipOffset.current);
        panPip.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: panPip.x, dy: panPip.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gs) => {
        panPip.flattenOffset();
        const clampX = Math.max(10, Math.min(width - PIP_W - 10, panPipOffset.current.x + gs.dx));
        const clampY = Math.max(
          Platform.OS === 'android' ? 24 : 44,
          Math.min(height - PIP_H - 170, panPipOffset.current.y + gs.dy),
        );
        panPipOffset.current = { x: clampX, y: clampY };
        Animated.spring(panPip, {
          toValue: { x: clampX, y: clampY },
          useNativeDriver: false,
          tension: 90,
          friction: 12,
        }).start();
      },
    })
  ).current;

  // Ensure we use the correct ID property
  const userId = user?.id || (user as any)?._id || (user as any)?.uid || '';
  const isCaller = callSession?.caller.id === userId;
  const otherPerson = isCaller ? callSession?.receiver : callSession?.caller;
  const localUid = getNumericUid(userId);

  // 1. Timer Logic - mathematically accurate and continuous
  useEffect(() => {
    let interval: any;
    const isConnected = !!remoteUid || !!AgoraService.getRemoteUid() || callSession?.status === 'ACTIVE' || AgoraService.getConnectedAt() !== null;
    if (isConnected) {
      if (!AgoraService.getConnectedAt()) {
        AgoraService.setConnectedAt(Date.now());
      }
      setCallDuration(AgoraService.getElapsedDuration());
      interval = setInterval(() => {
        setCallDuration(AgoraService.getElapsedDuration());
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [remoteUid, callSession?.status]);

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
        -1,
        1,
        0,
        60,
        true
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

  // Request Permissions
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

  const handleHangup = useCallback(() => {
    if (hasExited.current) return;
    hasExited.current = true;

    console.log('📞 [ActiveCallScreen] Hanging up and exiting...');
    stopRingback();
    AgoraService.leaveAndRelease();
    endCall();

    setTimeout(() => {
      goBack();
    }, 100);
  }, [endCall, stopRingback]);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
    goBack();
  }, [setIsMinimized]);

  // Intercept Android Hardware Back Button to Minimize
  useEffect(() => {
    const backAction = () => {
      handleMinimize();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [handleMinimize]);

  // System-level Picture-in-Picture (OS PiP) Mode Setup
  useEffect(() => {
    const isVideo = callSession?.type === 'video';
    const isConnected = !!remoteUid || !!AgoraService.getRemoteUid() || callSession?.status === 'ACTIVE';

    if (isVideo && isConnected) {
      PipService.setAutoPip(true);
    } else {
      PipService.setAutoPip(false);
    }

    const unsubscribe = PipService.addPipListener((inPip) => {
      console.log('🖼️ [ActiveCallScreen] PiP Mode Changed:', inPip);
      setIsInPipMode(inPip);
    });

    return () => {
      PipService.setAutoPip(false);
      unsubscribe();
    };
  }, [callSession?.type, callSession?.status, remoteUid]);

  // 3. Initialize Agora Engine
  useEffect(() => {
    let setupEngine = async () => {
      try {
        if (!appId) {
          console.warn('⚠️ [Agora] App ID missing - skipping init');
          return;
        }
        console.log('🏗️ [Agora] Initializing Engine...');
        const isVideoCall = callSession?.type === 'video';
        await requestPermissions();

        let rtcEngine = AgoraService.getEngine();
        if (!rtcEngine) {
          rtcEngine = AgoraService.getOrCreateEngine();
          rtcEngine.initialize({ appId: appId });
        }
        engine.current = rtcEngine;

        // Event Listeners (Agora v4)
        engine.current.registerEventHandler({
          onJoinChannelSuccess: (connection: RtcConnection, elapsed: number) => {
            console.log('✅ [Agora-Diag] Joined Success:', connection.channelId, 'UID:', connection.localUid);
            setIsJoined(true);
            AgoraService.setIsJoined(true);
            AgoraService.setCurrentChannel(connection.channelId || null);

            // Set initial speaker route
            const initialSpeaker = isVideoCall;
            engine.current?.setEnableSpeakerphone(initialSpeaker);
            engine.current?.setDefaultAudioRouteToSpeakerphone(initialSpeaker);
            setIsSpeakerOn(initialSpeaker);

            if (isVideoCall) {
              engine.current?.startPreview();
            }

            if (Platform.OS === 'android') {
              InCallManager.setSpeakerphoneOn(initialSpeaker);
              InCallManager.setForceSpeakerphoneOn(initialSpeaker);
            } else {
              InCallManager.setForceSpeakerphoneOn(initialSpeaker);
            }
          },
          onUserJoined: (connection: RtcConnection, uid: number, elapsed: number) => {
            console.log('👤 [Agora-Diag] Remote User Joined:', uid);
            setRemoteUid(uid);
            AgoraService.setRemoteUid(uid);
            if (!AgoraService.getConnectedAt()) {
              AgoraService.setConnectedAt(Date.now());
            }
            stopRingback();
          },
          onUserOffline: (connection: RtcConnection, remoteUidVal: number, reason: UserOfflineReasonType) => {
            console.log('👋 [Agora-Diag] Remote User Offline | UID:', remoteUidVal, 'Code:', reason);
            setRemoteUid(null);
            AgoraService.setRemoteUid(null);
            handleHangup();
          },
          onLocalAudioStateChanged: (connection: RtcConnection, state: LocalAudioStreamState, error: LocalAudioStreamReason) => {
            console.log('🎤 [Agora-Diag] Local Audio State:', state, 'Error:', error);
          },
          onRemoteAudioStateChanged: (connection: RtcConnection, remoteUidVal: number, state: RemoteAudioState, reason: RemoteAudioStateReason, elapsed: number) => {
            console.log('🔊 [Agora-Diag] Remote Audio UID:', remoteUidVal, 'State:', state, 'Reason:', reason);
          },
          onAudioRoutingChanged: (routing: number) => {
            console.log('📡 [Agora-Diag] Routing Changed to:', routing);
            // Routing: 3 = Speakerphone, 1 = Earpiece, 0 = Headset, 5 = Bluetooth
            setIsSpeakerOn(routing === 3);
          },
          onAudioVolumeIndication: (connection: RtcConnection, speakers: AudioVolumeInfo[], speakerNumber: number, totalVolume: number) => {
            if (totalVolume > 5) {
              console.log('📊 [Agora-Diag] Volume Detect:', totalVolume);
            }
          },
          onLocalVideoStateChanged: (source: VideoSourceType, state: LocalVideoStreamState, error: LocalVideoStreamReason) => {
            console.log('📹 [Agora-Diag] Local Video State:', state, 'Error:', error);
          },
          onError: (err: number, msg: string) => {
            console.error('❌ [Agora-Diag] Engine Error:', err, msg);
          }
        });

        // Hardware Trigger & Parameters
        if (Platform.OS === 'ios') {
          InCallManager.start({ media: isVideoCall ? 'video' : 'audio' });
        } else {
          InCallManager.start({ media: isVideoCall ? 'video' : 'audio' });
        }
        await engine.current.setParameters('{"che.audio.opensl":true}');
        await engine.current.setParameters('{"che.audio.android.opensl":true}');

        await engine.current.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
        await engine.current.enableAudio();

        await engine.current.setAudioProfile(
          AudioProfileType.AudioProfileSpeechStandard,
          isVideoCall
            ? AudioScenarioType.AudioScenarioChatroom
            : AudioScenarioType.AudioScenarioMeeting
        );

        console.log('✅ [Agora] Basic Modules Enabled');

        await engine.current.adjustRecordingSignalVolume(isVideoCall ? 200 : 150);
        await engine.current.adjustPlaybackSignalVolume(isVideoCall ? 400 : 150);

        if (isVideoCall) {
          await engine.current.enableVideo();
        }

        await engine.current.enableLocalAudio(true);
        await engine.current.muteLocalAudioStream(false);
        await engine.current.muteAllRemoteAudioStreams(false);
        await engine.current.enableAudioVolumeIndication(250, 3, false);

        console.log(`✅ [Agora] Engine Ready and Parameters Set`);
        setIsEngineReady(true);

        if (callSession?.status === 'OUTGOING') {
          playRingback();
        }
      } catch (e) {
        console.error('❌ [Agora] Setup Error:', e);
      }
    };

    if (appId) {
      setupEngine();
    }

    return () => {
      console.log('🧹 [ActiveCallScreen] Screen unmounted. HasExited:', hasExited.current);
      stopRingback();
      if (hasExited.current) {
        AgoraService.leaveAndRelease();
      }
    };
  }, [appId, handleHangup, playRingback, stopRingback]);

  useEffect(() => {
    const join = async () => {
      const isAudioReady = Platform.OS === 'android' ? true : isAudioActivated;

      if (isEngineReady && engine.current && token && appId && localUid && !isJoined && isAudioReady) {
        if (!callSession || !callSession.channelName) return;

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
  }, [token, appId, isJoined, localUid, isEngineReady, callSession?.channelName, callSession?.type, isAudioActivated]);

  // 5. Control Handlers
  const toggleMute = () => {
    if (engine.current) {
      const nextMute = !isMuted;
      engine.current.muteLocalAudioStream(nextMute);
      setIsMuted(nextMute);
    }
  };

  const toggleVideo = () => {
    if (engine.current && callSession?.type === 'video') {
      const nextVideoState = !isVideoEnabled;
      engine.current.muteLocalVideoStream(!nextVideoState);
      setIsVideoEnabled(nextVideoState);
    }
  };

  const toggleSpeaker = useCallback(() => {
    const nextState = !isSpeakerOn;
    setIsSpeakerOn(nextState);

    if (engine.current) {
      engine.current.setEnableSpeakerphone(nextState);
      engine.current.setDefaultAudioRouteToSpeakerphone(nextState);
    }

    if (Platform.OS === 'android') {
      InCallManager.setSpeakerphoneOn(nextState);
      InCallManager.setForceSpeakerphoneOn(nextState);
    } else {
      InCallManager.setForceSpeakerphoneOn(nextState);
    }
    console.log('🔊 [ActiveCallScreen] Speakerphone set to:', nextState);
  }, [isSpeakerOn]);

  const switchCamera = () => {
    if (engine.current && isVideoEnabled) {
      engine.current.switchCamera();
      setIsCameraFront(!isCameraFront);
    }
  };

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
      {!isInPipMode && <StatusBar barStyle="light-content" />}

      {/* Minimize button — top-left overlay */}
      {!isInPipMode && (
        <TouchableOpacity
          style={styles.minimizeButton}
          onPress={handleMinimize}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Icon name="chevron-down" size={26} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      )}

      {/* Top Video Header Overlay with duration badge (Video calls) */}
      {!isInPipMode && callSession.type === 'video' && (remoteUid || AgoraService.getRemoteUid()) && (
        <View style={styles.videoTopHeader}>
          <Text style={styles.videoPeerName}>{otherPerson?.name || 'In Call'}</Text>
          <View style={styles.durationPill}>
            <View style={styles.liveDot} />
            <Text style={styles.videoDurationText}>{formatDuration(callDuration)}</Text>
          </View>
        </View>
      )}

      {/* 1. Main View (Remote Video or Avatar) */}
      <View style={styles.videoGrid}>
        {callSession.type === 'video' && (remoteUid || AgoraService.getRemoteUid()) ? (
          <RtcSurfaceView
            canvas={{ uid: (remoteUid || AgoraService.getRemoteUid()) as number }}
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
              {(remoteUid || AgoraService.getRemoteUid() || callSession.status === 'ACTIVE' || AgoraService.getConnectedAt() !== null)
                ? formatDuration(callDuration)
                : 'Ringing...'}
            </Text>
          </View>
        )}

        {/* 2. Draggable Local Video (PIP) - hidden in OS PiP mode to avoid occluding remote video */}
        {!isInPipMode && callSession.type === 'video' && isJoined && isVideoEnabled && (
          <Animated.View
            style={[
              styles.localVideoContainer,
              { transform: panPip.getTranslateTransform() }
            ]}
            {...pipPanResponder.panHandlers}
          >
            <RtcSurfaceView
              canvas={{ uid: 0 }}
              style={styles.localVideo}
              zOrderMediaOverlay={true}
            />
          </Animated.View>
        )}
      </View>

      {/* 3. Control Bar */}
      {!isInPipMode && (
        <View style={styles.controlsContainer}>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.controlsGradient}
          >
            <View style={styles.controlsRow}>
              {/* Speaker Toggle Button (Available for BOTH Audio & Video calls) */}
              <TouchableOpacity
                style={[styles.iconButton, isSpeakerOn && styles.activeSpeakerButton]}
                onPress={toggleSpeaker}
              >
                <Icon name={isSpeakerOn ? "volume-high" : "volume-low"} size={26} color="white" />
              </TouchableOpacity>

              {/* Video Toggle Button (For Video Calls) */}
              {callSession.type === 'video' && (
                <TouchableOpacity
                  style={[styles.iconButton, !isVideoEnabled && styles.inactiveButton]}
                  onPress={toggleVideo}
                >
                  <Icon name={isVideoEnabled ? "video" : "video-off"} size={26} color="white" />
                </TouchableOpacity>
              )}

              {/* Mute Microphone Button */}
              <TouchableOpacity
                style={[styles.iconButton, isMuted && styles.inactiveButton]}
                onPress={toggleMute}
              >
                <Icon name={isMuted ? "microphone-off" : "microphone"} size={26} color="white" />
              </TouchableOpacity>

              {/* Switch Camera Button (For Video Calls) */}
              {callSession.type === 'video' && (
                <TouchableOpacity style={styles.iconButton} onPress={switchCamera}>
                  <Icon name="camera-flip" size={26} color="white" />
                </TouchableOpacity>
              )}

              {/* Hangup Call Button */}
              <TouchableOpacity style={[styles.iconButton, styles.hangupButton]} onPress={handleHangup}>
                <Icon name="phone-hangup" size={30} color="white" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1c2c',
  },
  minimizeButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 44 : 52,
    left: 18,
    zIndex: 100,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoTopHeader: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 44 : 52,
    left: 70,
    right: 70,
    zIndex: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPeerName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginBottom: 4,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  videoDurationText: {
    color: '#E0E7FF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
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
    width: PIP_W,
    height: PIP_H,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    zIndex: 99,
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
    height: 140,
  },
  controlsGradient: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 36,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeSpeakerButton: {
    backgroundColor: '#3B82F6',
  },
  inactiveButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.6)',
  },
  hangupButton: {
    backgroundColor: '#EF4444',
    width: 62,
    height: 62,
    borderRadius: 31,
  },
});

export default ActiveCallScreen;
