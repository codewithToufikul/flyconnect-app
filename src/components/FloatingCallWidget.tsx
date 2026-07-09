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
import { useCall } from '../context/CallContext';
import { navigate } from '../navigation/RootNavigation';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Widget dimensions
const WIDGET_W = 200;
const WIDGET_H = 64;

// Default position: top-right corner with margin
const INITIAL_X = SCREEN_W - WIDGET_W - 16;
const INITIAL_Y = Platform.OS === 'android' ? 60 : 90;

const FloatingCallWidget = () => {
  const { callSession, endCall, isMinimized, setIsMinimized } = useCall();

  // Duration timer
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isMinimized && callSession?.status === 'ACTIVE') {
      setSeconds(0);
      timerRef.current = setInterval(() => {
        setSeconds(s => s + 1);
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
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

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
        const clampX = Math.max(0, Math.min(SCREEN_W - WIDGET_W, panOffset.current.x + gs.dx));
        const clampY = Math.max(
          Platform.OS === 'android' ? 24 : 44,
          Math.min(SCREEN_H - WIDGET_H - 32, panOffset.current.y + gs.dy),
        );
        panOffset.current = { x: clampX, y: clampY };
        Animated.spring(pan, {
          toValue: { x: clampX, y: clampY },
          useNativeDriver: false,
          tension: 80,
          friction: 10,
        }).start();
      },
    }),
  ).current;

  if (!isMinimized || !callSession) return null;

  const isVideo = callSession.type === 'video';
  const otherPerson =
    callSession.caller.id !== callSession.receiver.id
      ? callSession.caller
      : callSession.receiver;
  const avatar = otherPerson?.profileImage;

  const handleRestore = () => {
    setIsMinimized(false);
    navigate('ActiveCall', {});
  };

  const handleEndCall = () => {
    endCall();
  };

  return (
    <Animated.View
      style={[styles.container, { transform: pan.getTranslateTransform() }]}
      {...panResponder.panHandlers}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handleRestore}
        style={styles.inner}>
        {/* Avatar / call icon */}
        <View style={styles.avatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Icon
                name={isVideo ? 'video' : 'phone'}
                size={20}
                color="#fff"
              />
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
  container: {
    position: 'absolute',
    width: WIDGET_W,
    height: WIDGET_H,
    zIndex: 9999,
    elevation: 20, // Android
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  inner: {
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
