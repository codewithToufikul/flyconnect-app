import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Animated,
  Dimensions,
  Image,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RtcSurfaceView } from 'react-native-agora';
import LinearGradient from 'react-native-linear-gradient';
import { useCall } from '../context/CallContext';
import { useProfile } from '../context/ProfileContext';
import { navigate } from '../navigation/RootNavigation';
import AgoraService from '../services/AgoraService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Dimensions
const AUDIO_W = 200;
const AUDIO_H = 64;

const VIDEO_W = 115;
const VIDEO_H = 165;

const INITIAL_X = SCREEN_W - VIDEO_W - 16;
const INITIAL_Y = Platform.OS === 'android' ? 60 : 90;

const FloatingCallWidget = () => {
  const { callSession, endCall, isMinimized, setIsMinimized } = useCall();
  const { user } = useProfile();

  // Continuous accurate duration timer
  const [seconds, setSeconds] = useState(AgoraService.getElapsedDuration());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const isConnected = callSession?.status === 'ACTIVE' || AgoraService.getConnectedAt() !== null;
    if (isMinimized && isConnected) {
      setSeconds(AgoraService.getElapsedDuration());
      timerRef.current = setInterval(() => {
        setSeconds(AgoraService.getElapsedDuration());
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isMinimized, callSession?.status]);

  const formatDuration = (s: number) => {
    const hrs = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const isVideo = callSession?.type === 'video';
  const currentWidgetW = isVideo ? VIDEO_W : AUDIO_W;
  const currentWidgetH = isVideo ? VIDEO_H : AUDIO_H;

  // Drag position
  const pan = useRef(new Animated.ValueXY({ x: INITIAL_X, y: INITIAL_Y })).current;
  const panOffset = useRef({ x: INITIAL_X, y: INITIAL_Y });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        pan.setOffset(panOffset.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gs) => {
        pan.flattenOffset();
        // Clamp within screen bounds
        const clampX = Math.max(8, Math.min(SCREEN_W - currentWidgetW - 8, panOffset.current.x + gs.dx));
        const clampY = Math.max(
          Platform.OS === 'android' ? 24 : 44,
          Math.min(SCREEN_H - currentWidgetH - 32, panOffset.current.y + gs.dy),
        );
        panOffset.current = { x: clampX, y: clampY };
        Animated.spring(pan, {
          toValue: { x: clampX, y: clampY },
          useNativeDriver: false,
          tension: 85,
          friction: 11,
        }).start();
      },
    }),
  ).current;

  if (!isMinimized || !callSession) return null;

  const currentUserId = (user as any)?._id || (user as any)?.id || '';
  const isCaller = callSession.caller.id === currentUserId;
  const otherPerson = isCaller ? callSession.receiver : callSession.caller;
  const avatar = otherPerson?.profileImage;
  const remoteUid = AgoraService.getRemoteUid();

  const handleRestore = () => {
    setIsMinimized(false);
    navigate('ActiveCall', {});
  };

  const handleEndCall = () => {
    endCall();
  };

  // ── Render Messenger-Style Video Mini Screen (PIP) ─────────────────────────
  if (isVideo) {
    return (
      <Animated.View
        style={[
          styles.videoContainer,
          { transform: pan.getTranslateTransform() },
        ]}
        {...panResponder.panHandlers}>
        <TouchableOpacity
          activeOpacity={0.94}
          onPress={handleRestore}
          style={styles.videoInner}>
          {/* Video stream or avatar fallback */}
          {remoteUid ? (
            <RtcSurfaceView
              canvas={{ uid: remoteUid }}
              style={styles.pipVideo}
              zOrderMediaOverlay={true}
            />
          ) : (
            <View style={styles.videoAvatarFallback}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.videoFallbackAvatar} />
              ) : (
                <Icon name="video" size={32} color="#818CF8" />
              )}
            </View>
          )}

          {/* Top subtle gradient overlay */}
          <LinearGradient
            colors={['rgba(0,0,0,0.65)', 'transparent']}
            style={styles.pipTopGradient}>
            <View style={styles.pipLiveBadge}>
              <View style={styles.pipLiveDot} />
              <Text style={styles.pipDurationText}>{formatDuration(seconds)}</Text>
            </View>
          </LinearGradient>

          {/* Bottom subtle control overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.pipBottomGradient}>
            {/* Maximize hint icon */}
            <View style={styles.pipExpandBtn}>
              <Icon name="arrow-expand" size={14} color="#fff" />
            </View>

            {/* End call button */}
            <TouchableOpacity
              style={styles.pipEndBtn}
              onPress={handleEndCall}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="phone-hangup" size={13} color="#fff" />
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Render Audio Call Capsule Bar ──────────────────────────────────────────
  return (
    <Animated.View
      style={[
        styles.audioContainer,
        { transform: pan.getTranslateTransform() },
      ]}
      {...panResponder.panHandlers}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handleRestore}
        style={styles.audioInner}>
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Icon name="phone" size={20} color="#fff" />
            </View>
          )}
          {/* Pulsing active dot */}
          <View style={styles.activeDot} />
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {otherPerson?.name || 'Call'}
          </Text>
          <Text style={styles.duration}>{formatDuration(seconds)}</Text>
        </View>

        {/* End call button */}
        <TouchableOpacity
          style={styles.endBtn}
          onPress={handleEndCall}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="phone-hangup" size={18} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Video Mini PIP styles
  videoContainer: {
    position: 'absolute',
    width: VIDEO_W,
    height: VIDEO_H,
    zIndex: 9999,
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  videoInner: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    position: 'relative',
  },
  pipVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoAvatarFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E293B',
  },
  videoFallbackAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  pipTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    paddingTop: 6,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  pipLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pipLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
    marginRight: 4,
  },
  pipDurationText: {
    color: '#E0E7FF',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pipBottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 6,
    paddingHorizontal: 8,
  },
  pipExpandBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipEndBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Audio Capsule styles
  audioContainer: {
    position: 'absolute',
    width: AUDIO_W,
    height: AUDIO_H,
    zIndex: 9999,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  audioInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(99,179,237,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    overflow: 'hidden',
  },
  avatarWrap: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#4ade80',
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ade80',
    borderWidth: 2,
    borderColor: '#1a1a2e',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  duration: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  endBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default FloatingCallWidget;

