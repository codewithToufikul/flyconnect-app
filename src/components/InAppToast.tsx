import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useToast } from '../context/ToastContext';
import { navigate } from '../navigation/RootNavigation';

const { width } = Dimensions.get('window');

const getMessagePreview = (message: string, contentType?: string): string => {
  if (!message) return '';
  switch (contentType) {
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'audio': return '🎵 Voice message';
    case 'file': return '📎 File';
    default:
      return message.length > 55 ? message.substring(0, 55) + '...' : message;
  }
};

const InAppToast: React.FC = () => {
  const { currentToast, dismissToast } = useToast();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (currentToast) {
      // Slide in from top
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide out to top
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [currentToast]);

  if (!currentToast) return null;

  const handlePress = () => {
    dismissToast();
    navigate('ChatScreen', {
      user: {
        _id: currentToast.senderId || currentToast.conversationId,
        name: currentToast.senderName,
        profileImage: currentToast.senderImage,
      },
    });
  };

  const preview = getMessagePreview(currentToast.message, currentToast.contentType);

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY }], opacity },
      ]}
    >
      <TouchableOpacity
        style={styles.toast}
        activeOpacity={0.95}
        onPress={handlePress}
      >
        {/* Left: Avatar */}
        <View style={styles.avatarWrapper}>
          {currentToast.senderImage ? (
            <Image source={{ uri: currentToast.senderImage }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {currentToast.senderName?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.onlineDot} />
        </View>

        {/* Center: Text */}
        <View style={styles.textContainer}>
          <Text style={styles.senderName} numberOfLines={1}>
            {currentToast.senderName}
          </Text>
          <Text style={styles.messagePreview} numberOfLines={1}>
            {preview}
          </Text>
        </View>

        {/* Right: Close */}
        <TouchableOpacity onPress={dismissToast} style={styles.closeBtn} hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}>
          <Icon name="close" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 30, 50, 0.97)',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: width - 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    gap: 10,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#818CF8',
  },
  avatarInitial: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: 'rgba(30, 30, 50, 1)',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  senderName: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  messagePreview: {
    color: 'rgba(200, 200, 220, 0.85)',
    fontSize: 13,
    fontWeight: '400',
  },
  closeBtn: {
    padding: 4,
  },
});

export default InAppToast;
