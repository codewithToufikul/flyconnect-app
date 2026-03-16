import messaging from '@react-native-firebase/messaging';
import {Platform, PermissionsAndroid} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  EventType,
} from '@notifee/react-native';
import api from './api';

const FCM_TOKEN_KEY = '@fcm_token';
const CHAT_CHANNEL_ID = 'chat_messages';

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.createChannel({
      id: CHAT_CHANNEL_ID,
      name: 'Chat Messages',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
    });
    console.log('✅ [NotificationService] Android notification channel ensured.');
  } catch (e) {
    console.error('❌ [NotificationService] Failed to create channel:', e);
  }
}

class NotificationService {
  /**
   * Request permissions (Modular API)
   */
  async requestUserPermission() {
    console.log('Firebase: Requesting user permission...');

    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      console.log('Firebase: Android 13+ Notification Permission:', granted);
    }

    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Firebase: Permission granted. Status:', authStatus);
      await this.getFcmToken();
    }
  }

  /**
   * Get and Sync Token (Force Sync to fix "0 Tokens" issue)
   */
  async getFcmToken() {
    try {
      if (Platform.OS === 'ios') {
        await messaging().registerDeviceForRemoteMessages();
      }

      // Modular API: getToken()
      const freshToken = await messaging().getToken();
      
      if (freshToken) {
        console.log('Firebase: Syncing FCM Token with backend (Force Sync)...');
        await AsyncStorage.setItem(FCM_TOKEN_KEY, freshToken);
        await this.registerTokenWithBackend(freshToken);
        return freshToken;
      } else {
        console.warn('Firebase: No fresh token retrieved.');
      }
    } catch (error: any) {
      console.error('Firebase: Token Error:', error);
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

  /**
   * Display Foreground Banner
   */
  private async displayForegroundNotification(remoteMessage: any) {
    console.log('📱 [NotificationService] Received Foreground FCM:', remoteMessage.messageId);
    
    await ensureAndroidChannel();

    const title = remoteMessage.data?.senderName || remoteMessage.notification?.title || 'New Message';
    const body = remoteMessage.data?.content || remoteMessage.notification?.body || '';

    try {
      await notifee.displayNotification({
        id: remoteMessage.messageId, // Use FCM messageId as Notifee ID to avoid duplicates
        title,
        body,
        data: remoteMessage.data || {},
        android: {
          channelId: CHAT_CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          pressAction: {id: 'default'},
          smallIcon: 'ic_launcher',
          color: '#6366F1',
        },
        ios: {
          foregroundPresentationOptions: {
            badge: true,
            sound: true,
            banner: true,
            list: true,
          },
        },
      });
      console.log('✅ [NotificationService] Banner shown.');
    } catch (e) {
      console.error('❌ [NotificationService] Banner error:', e);
    }
  }

  listenForForegroundMessages() {
    console.log('👂 [NotificationService] Listening for foreground messages...');
    return messaging().onMessage(async remoteMessage => {
      await this.displayForegroundNotification(remoteMessage);
    });
  }

  async initialize() {
    await ensureAndroidChannel();
    this.listenForForegroundMessages();

    // Check permission status
    const authStatus = await messaging().hasPermission();
    if (authStatus === messaging.AuthorizationStatus.AUTHORIZED) {
      await this.getFcmToken();
    }
    
    // Listen for notifee events (like tapping a banner while app is open)
    notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        console.log('🖱️ [NotificationService] Foreground banner pressed');
        // Navigation is handled in App.tsx via onNotificationOpenedApp 
        // which triggers even for foreground notifee presses if configured.
      }
    });
  }
}

export default new NotificationService();
