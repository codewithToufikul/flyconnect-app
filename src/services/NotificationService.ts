import messaging from '@react-native-firebase/messaging';
import {Alert, Platform, PermissionsAndroid} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const FCM_TOKEN_KEY = '@fcm_token';

class NotificationService {
  async requestUserPermission() {
    console.log('Firebase: Requesting user permission...');

    // For Android 13+, we need to request POST_NOTIFICATIONS explicitly
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        console.log('Firebase: Android 13+ Notification Permission:', granted);
      } catch (err) {
        console.warn('Firebase: Error requesting Android 13 permission:', err);
      }
    }

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Firebase: Permission granted. Status:', authStatus);
      const token = await this.getFcmToken();
      if (token) {
        console.log('Firebase: FCM initialized successfully. Token acquired.');
      }
    } else {
      console.log('Firebase: Permission denied or not determined.');
    }
  }

  async getFcmToken() {
    try {
      if (Platform.OS === 'ios') {
        await messaging().registerDeviceForRemoteMessages();
      }

      let fcmToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);

      // Always get fresh token from firebase
      let freshToken;
      try {
        freshToken = await messaging().getToken();
        console.log(
          'Firebase: Retrieved raw FCM Token:',
          freshToken ? '✅' : '❌',
        );
      } catch (e: any) {
        if (Platform.OS === 'ios' && e.message?.includes('APNS token')) {
          console.log('Firebase: APNS token not ready, retrying...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          freshToken = await messaging().getToken();
        } else {
          throw e;
        }
      }

      if (freshToken && freshToken !== fcmToken) {
        console.log('Firebase: New Token detected. Updating backend...');
        await AsyncStorage.setItem(FCM_TOKEN_KEY, freshToken);
        await this.registerTokenWithBackend(freshToken);
      } else if (freshToken) {
        console.log('Firebase: Connection stable. Token matches storage.');
      }

      return freshToken;
    } catch (error: any) {
      if (Platform.OS === 'ios' && error.message?.includes('APNS token')) {
        console.warn('Firebase: APNS not available (Simulator).');
      } else {
        console.error('Firebase: Token Error:', error);
      }
    }
  }

  async registerTokenWithBackend(token: string) {
    try {
      await api.post('/api/v1/auth/register-fcm-token', {token});
      console.log('Firebase: Token successfully synced with backend API.');
    } catch (error) {
      console.error('Firebase: Backend Sync Error:', error);
    }
  }

  // Handle foreground messages
  listenForForegroundMessages() {
    return messaging().onMessage(async remoteMessage => {
      console.log(
        'Firebase: New Foreground Message:',
        remoteMessage.notification?.title,
      );
      Alert.alert(
        remoteMessage.notification?.title || 'New Notification',
        remoteMessage.notification?.body || '',
      );
    });
  }

  // Handle background/quit state messages
  listenForBackgroundMessages() {
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Background message received:', remoteMessage);
    });
  }

  async initialize() {
    console.log('Firebase: Starting messaging service initialization...');
    this.listenForForegroundMessages();

    const authStatus = await messaging().hasPermission();
    if (
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL
    ) {
      console.log('Firebase: App has existing permissions. Fetching token...');
      this.getFcmToken();
    } else {
      console.log(
        'Firebase: No notification permissions found. Awaiting user action.',
      );
    }
  }
}

export default new NotificationService();
