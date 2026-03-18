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
import api, {getToken} from './api';

const FCM_TOKEN_KEY = '@fcm_token';
const CHAT_CHANNEL_ID = 'chat_messages';
const CALL_CHANNEL_ID = 'calls';

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

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
      sound: 'ringtone', // References res/raw/ringtone.wav
      vibration: true,
      lightColor: '#ff0000',
    });

    console.log(
      '✅ [NotificationService] Android notification channels ensured.',
    );
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

    const data = remoteMessage.data || {};
    const {callerName, callId, type, callerId} = data;
    const uuid = data.callUUID || generateUUID();

    try {
      // We will handle CallKeep registration directly in the Background Handler
      // to avoid race conditions. So we remove the redundant call here.

      await notifee.displayNotification({
        id: callId || 'incoming_call',
        title: `Incoming ${data.callType || 'audio'} call`,
        body: `${callerName || 'Someone'} is calling you...`,
        data: {
          ...data,
          callUUID: uuid,
        },
        android: {
          channelId: CALL_CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          category: AndroidCategory.CALL,
          visibility: AndroidVisibility.PUBLIC,
          ongoing: true,
          autoCancel: false,
          smallIcon: 'ic_launcher',
          fullScreenAction: {
            id: 'default',
            mainComponent: 'FlyConnect',
          },
          pressAction: {
            id: 'default',
            launchActivity: 'default',
          },
          actions: [
            {
              title: 'Answer',
              pressAction: {id: 'answer', launchActivity: 'default'},
            },
            {
              title: 'Decline',
              pressAction: {id: 'decline'},
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
    const title =
      remoteMessage.data?.senderName ||
      remoteMessage.notification?.title ||
      'New Message';
    const body =
      remoteMessage.data?.content || remoteMessage.notification?.body || '';

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
    console.log(
      '👂 [NotificationService] Listening for foreground messages...',
    );
    return messaging().onMessage(async remoteMessage => {
      const type = remoteMessage.data?.type;
      console.log('📱 [NotificationService] Foreground message:', type);
      
      if (type === 'CALL_INCOMING') {
        console.log('📞 [NotificationService] Call incoming in foreground, skipping banner.');
      } else if (type === 'CALL_CANCELLED' || type === 'CALL_ENDED') {
        console.log('🛑 [NotificationService] Call cancelled/ended, clearing notifications.');
        await this.cancelAllCallNotifications();
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
    notifee.onForegroundEvent(async ({type, detail}) => {
      const {notification, pressAction} = detail;

      if (type === EventType.PRESS) {
        console.log('🖱️ [NotificationService] Foreground banner pressed');
        if (notification?.id) {
          await notifee.cancelNotification(notification.id);
        }
      }

      if (type === EventType.ACTION_PRESS) {
        const uuid = (notification?.data?.callUUID as string) || 'unknown';
        
        // Always cancel notification on any action press
        if (notification?.id) {
          await notifee.cancelNotification(notification.id);
        }

        if (pressAction?.id === 'answer') {
          console.log('📞 [Notifee] Foreground Answer pressed for:', uuid);
          if (uuid !== 'unknown') {
            RNCallKeep.answerIncomingCall(uuid);
          }
        }

        if (pressAction?.id === 'decline') {
          console.log('🛑 [Notifee] Foreground Decline pressed');
          
          try {
            const data = notification?.data as any;
            if (data?.callId && data?.callerId) {
              const { declineCallAPI } = require('./api');
              await declineCallAPI({
                callId: data.callId,
                callerId: data.callerId
              });
            }
          } catch (err) {
            console.error('❌ [Notifee] Failed to signal decline in foreground:', err);
          }

          RNCallKeep.endAllCalls();
        }
      }
    });
  }

  /**
   * Helper to clear all call notifications
   */
  async cancelAllCallNotifications() {
    await notifee.cancelAllNotifications();
  }
}

export default new NotificationService();
