import messaging from '@react-native-firebase/messaging';
import {Platform, PermissionsAndroid} from 'react-native';
import RNCallKeep from 'react-native-callkeep';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  EventType,
  AndroidCategory,
} from '@notifee/react-native';
import api, { getToken } from './api';

const FCM_TOKEN_KEY = '@fcm_token';
const CHAT_CHANNEL_ID = 'chat_messages';
const CALL_CHANNEL_ID = 'calls';

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  try {
    // Chat Channel
    await notifee.createChannel({
      id: CHAT_CHANNEL_ID,
      name: 'Chat Messages',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
    });

    // Calls Channel
    await notifee.createChannel({
      id: CALL_CHANNEL_ID,
      name: 'Incoming Calls',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      sound: 'default',
      vibration: true,
      lightColor: '#ff0000',
    });

    console.log('✅ [NotificationService] Android notification channels ensured.');
  } catch (e) {
    console.error('❌ [NotificationService] Failed to create channels:', e);
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
      // Guard: Don't fetch FCM token if user is not logged in
      const userToken = await getToken();
      if (!userToken) {
        console.log('Firebase: Skipping FCM token fetch - User not logged in.');
        return null;
      }

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
   * Display Call Head-up/Full Screen Notification
   */
  async displayCallNotification(remoteMessage: any) {
    if (Platform.OS !== 'android') return;
    
    const { callerName, callId, type, callerId, callUUID } = remoteMessage.data || {};
    
    try {
      await notifee.displayNotification({
        id: callId || 'incoming_call',
        title: `Incoming ${type || 'audio'} call`,
        body: callerName || 'Unknown Caller',
        data: {
          ...remoteMessage.data,
          callUUID: callUUID || 'unknown'
        },
        android: {
          channelId: CALL_CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          category: AndroidCategory.CALL,
          visibility: AndroidVisibility.PUBLIC,
          ongoing: true,
          smallIcon: 'ic_launcher',
          fullScreenAction: {
            id: 'default',
            mainComponent: 'FlyConnect', // Wake app
          },
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: 'Answer',
              pressAction: { id: 'answer', launchActivity: 'default' },
            },
            {
              title: 'Decline',
              pressAction: { id: 'decline' },
            },
          ],
        },
      });
    } catch (e) {
      console.error('❌ [NotificationService] Call notification error:', e);
    }
  }

  /**
   * Display Foreground Banner for chat messages
   */
  private async displayForegroundNotification(remoteMessage: any) {
    const title = remoteMessage.data?.senderName || remoteMessage.notification?.title || 'New Message';
    const body = remoteMessage.data?.content || remoteMessage.notification?.body || '';

    try {
      await notifee.displayNotification({
        id: remoteMessage.messageId, 
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
    } catch (e) {
      console.error('❌ [NotificationService] Banner error:', e);
    }
  }

  listenForForegroundMessages() {
    console.log('👂 [NotificationService] Listening for foreground messages...');
    return messaging().onMessage(async remoteMessage => {
      if (remoteMessage.data?.type === 'CALL_INCOMING') {
        // For selfManaged, we MUST show something or launch Activity
        await this.displayCallNotification(remoteMessage);
      } else {
        await this.displayForegroundNotification(remoteMessage);
      }
    });
  }

  async initialize() {
    await ensureAndroidChannels();
    this.listenForForegroundMessages();

    // Check permission status
    const authStatus = await messaging().hasPermission();
    if (authStatus === (messaging.AuthorizationStatus.AUTHORIZED as any)) {
      // Only get token if we have a user logged in to avoid 401 on sync
      const token = await getToken();
      if (token) {
        await this.getFcmToken();
      } else {
        console.log('Firebase: Skipping token sync - User not logged in.');
      }
    }
    
    // Listen for notifee events (like tapping a banner while app is open)
    notifee.onForegroundEvent(async ({ type, detail }) => {
      const { notification, pressAction } = detail;

      if (type === EventType.PRESS) {
        console.log('🖱️ [NotificationService] Foreground banner pressed');
        if (notification?.data?.type === 'CALL_INCOMING') {
           // If they just press the notification body, just open the app (navigate toscreen)
           // App.tsx handles general navigation, but if we're here, 
           // we should ensure they go to IncomingCall screen.
           // In foreground, we already navigate via socket handler in context.
        }
      }

      if (type === EventType.ACTION_PRESS) {
        const uuid = (notification?.data?.callUUID as string) || 'unknown';
        if (pressAction?.id === 'answer') {
          console.log('📞 [Notifee] Foreground Answer pressed for:', uuid);
          if (uuid !== 'unknown') {
            RNCallKeep.answerIncomingCall(uuid);
          } else {
            // Fallback for missing UUID: answer all if possible or just trigger first
            console.warn('⚠️ [NotificationService] Answer pressed but UUID is missing!');
          }
        }

        if (pressAction?.id === 'decline') {
          console.log('🛑 [Notifee] Foreground Decline pressed');
          RNCallKeep.endAllCalls();
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        }
      }
    });
  }
}

export default new NotificationService();
