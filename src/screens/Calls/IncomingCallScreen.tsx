import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
  Vibration,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Video from 'react-native-video';
import InCallManager from 'react-native-incall-manager';
import { useCall } from '../../context/CallContext';
import { goBack } from '../../navigation/RootNavigation';

const RINGTONE_URL = 'https://res.cloudinary.com/duyrnfagi/video/upload/v1773731369/mixkit-marimba-waiting-ringtone-1360_wi6le1.wav';

const IncomingCallScreen = () => {
  const { callSession, acceptCall, declineCall } = useCall();
  const [isPlaying, setIsPlaying] = React.useState(true);

  useEffect(() => {
    // Only go back if the call session is completely gone or finished
    if (!callSession || callSession.status !== 'INCOMING') {
      goBack();
    }
  }, [callSession?.status]);

  useEffect(() => {
    console.log('🔔 [IncomingCallScreen] Starting Ringtone Session...');
    // Force speakerphone and start audio session
    InCallManager.start({ media: 'audio' });
    InCallManager.setSpeakerphoneOn(true);
    InCallManager.setForceSpeakerphoneOn(true);
    
    // Start vibration pattern: [delay, vibrate, delay, vibrate...]
    const VIBRATE_PATTERN = [0, 500, 1000]; 
    Vibration.vibrate(VIBRATE_PATTERN, true);
    
    return () => {
      console.log('🔇 [IncomingCallScreen] Cleaning up IncomingCallScreen handlers');
      Vibration.cancel();
      // NOTE: We do NOT call InCallManager.stop() here because it might 
      // kill the audio session for the active call we are about to join.
    };
  }, []);

  const handleAccept = () => {
    console.log('✅ [IncomingCallScreen] Accept pressed');
    setIsPlaying(false);
    Vibration.cancel();
    // Do NOT stop InCallManager here, let it transition to active call
    acceptCall();
  };

  const handleDecline = () => {
    console.log('❌ [IncomingCallScreen] Decline pressed');
    setIsPlaying(false);
    Vibration.cancel();
    InCallManager.stop();
    declineCall();
  };

  if (!callSession) return null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#1a1c2c', '#4a192c']}
        style={styles.gradient}
      >
        <View style={styles.callerInfo}>
          <View style={styles.imageContainer}>
            <Image
              source={{
                uri:
                  callSession.caller.profileImage ||
                  'https://i.ibb.co/mcL9L2t/f10ff70a7155e5ab666bcdd1b45b726d.jpg',
              }}
              style={styles.avatar}
            />
          </View>
          <Text style={styles.callerName}>{callSession.caller.name}</Text>
          <Text style={styles.callType}>
            {callSession.type === 'video'
              ? 'Incoming Video Call...'
              : 'Incoming Audio Call...'}
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.declineButton]}
            onPress={handleDecline}
          >
            <Icon name="phone-hangup" size={32} color="white" />
            <Text style={styles.buttonText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.acceptButton]}
            onPress={handleAccept}
          >
            <Icon
              name={callSession.type === 'video' ? 'video' : 'phone'}
              size={32}
              color="white"
            />
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
        </View>

        {/* Hidden Audio Player for Ringtone */}
        {isPlaying && (
          <Video
            source={{ uri: RINGTONE_URL }}
            repeat={true}
            paused={!isPlaying}
            playInBackground={true}
            playWhenInactive={true}
            volume={1.0}
            style={{ width: 0, height: 0 }}
          />
        )}
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 100,
    alignItems: 'center',
  },
  callerInfo: {
    alignItems: 'center',
  },
  imageContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 3,
    borderColor: '#6366F1',
    padding: 5,
    marginBottom: 20,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 70,
  },
  callerName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 10,
  },
  callType: {
    fontSize: 16,
    color: '#ccc',
    letterSpacing: 1.2,
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-evenly',
    paddingHorizontal: 20,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  declineButton: {
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    backgroundColor: '#22C55E',
  },
  buttonText: {
    color: 'white',
    marginTop: 5,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default IncomingCallScreen;
