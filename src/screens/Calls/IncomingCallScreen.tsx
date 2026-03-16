import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCall } from '../../context/CallContext';
import { goBack } from '../../navigation/RootNavigation';

const IncomingCallScreen = () => {
  const { callSession, acceptCall, declineCall } = useCall();

  useEffect(() => {
    // If call is no longer incoming (cancelled by caller), go back
    if (!callSession || callSession.status !== 'INCOMING') {
      goBack();
    }
  }, [callSession]);

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
            onPress={declineCall}
          >
            <Icon name="phone-hangup" size={32} color="white" />
            <Text style={styles.buttonText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.acceptButton]}
            onPress={acceptCall}
          >
            <Icon
              name={callSession.type === 'video' ? 'video' : 'phone'}
              size={32}
              color="white"
            />
            <Text style={styles.buttonText}>Accept</Text>
          </TouchableOpacity>
        </View>
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
