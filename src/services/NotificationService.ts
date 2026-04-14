import messaging from '@react-native-firebase/messaging';
import {Platform, PermissionsAndroid, AppState} from 'react-native';
import RNCallKeep from 'react-native-callkeep';
import AsyncStorage from '@react-native-async-storage/async-storage';
import VoIPPushNotification from 'react-native-voip-push-notification';
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
  private static instance: NotificationService;
  private voipToken: string | null = null;
  private isVoIPInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }
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
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✨ [FCM TOKEN]:', freshToken);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
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
   * iOS VoIP PushKit Registration
   */
  async initializeVoIP() {
    if (Platform.OS !== 'ios') return;

    console.log('🍎 [VoIP] Initializing iOS VoIP PushKit...');

    const voip = VoIPPushNotification as any;
    const hasAddEventListener =
      voip && typeof voip.addEventListener === 'function';

    // 1. Listen for the registration token
    if (hasAddEventListener) {
      voip.addEventListener('register', async (token: string) => {
        console.log(
          '🍎 [VoIP] ✅ PushKit Token Received from iOS:',
          token.substring(0, 15) + '...',
        );
        this.voipToken = token; // Cache it
        await this.registerVoipTokenWithBackend(token);
      });
    }

    this.isVoIPInitialized = true;
    console.log('🍎 [VoIP] VoIP initialized state set to true.');

    // 2. Listen for incoming VoIP pushes (Guaranteed delivery in background/killed)
    if (hasAddEventListener) {
      voip.addEventListener('notification', (notification: any) => {
        console.log('🍎 [VoIP] Incoming VoIP Push:', notification);

        const {callId, callerName, callerId, callType, channelName, sentAt} =
          notification;
        const uuid = generateUUID();

        // Ghost-call check: Skip if > 45s
        if (sentAt) {
          const diff = Date.now() - parseInt(sentAt);
          if (diff > 45000) {
            console.log(
              `⏳ [VoIP] Call ${callId} too old (${diff}ms), ignoring.`,
            );
            return;
          }
        }

        // Display native CallKit UI ONLY if app is in background/killed state
        if (AppState.currentState !== 'active') {
          console.log(
            '🍎 [VoIP] App is in background/killed, showing CallKit UI.',
          );
          RNCallKeep.displayIncomingCall(
            uuid,
            callerName || 'Incoming Call',
            callerName || 'Someone',
            'generic',
            callType === 'video',
          );
        } else {
          console.log(
            '🍎 [VoIP] App is in foreground, skipping CallKit UI (Custom UI will handle it).',
          );
        }

        // Save to AsyncStorage so CallContext can pick it up if app is cold-booting
        AsyncStorage.setItem(
          '@pending_call_data',
          JSON.stringify({
            callId,
            callerName,
            callerId,
            callType: callType || 'audio',
            callUUID: uuid,
            timestamp: Date.now(),
          }),
        );

        // NOTE: react-native-voip-push-notification automatically handles
        // the "on-complete" signal back to iOS if you use the standard callback.
      });
    }

    // 3. Request registration (with a small delay to ensure listeners are ready)
    setTimeout(() => {
      console.log('📡 [VoIP] Requesting/Re-triggering registration...');
      if (
        VoIPPushNotification &&
        typeof (VoIPPushNotification as any).registerVoipToken === 'function'
      ) {
        (VoIPPushNotification as any).registerVoipToken();
      } else {
        console.warn(
          '⚠️ [VoIP] registerVoipToken method not found on library!',
        );
      }
    }, 1000);
  }

  async registerVoipTokenWithBackend(token: string, userId?: string) {
    try {
      // Check if user is logged in
      let status = userId;

      if (!status) {
        const userData = await AsyncStorage.getItem('@flyconnect_user');
        if (userData) {
          try {
            const user = JSON.parse(userData);
            status = user._id || user.id;
          } catch (e) {
            console.error('🍎 [VoIP] Failed to parse user data:', e);
          }
        }
      }

      if (!status) {
        console.log(
          '🍎 [VoIP] User ID not found in storage. Postponing VoIP sync.',
        );
        return;
      }

      console.log(
        `🍎 [VoIP] Syncing VoIP token with backend: ${token.substring(
          0,
          10,
        )}... for user: ${status}`,
      );
      await api.post('/api/v1/auth/register-voip-token', {voipToken: token});
      console.log('🍎 [VoIP] ✅ Token successfully synced with backend.');
    } catch (error) {
      console.error('🍎 [VoIP] Backend Sync Error:', error);
    }
  }

  /**
   * Public helper to refresh tokens (call this after login)
   */
  async syncTokensAfterLogin(userId?: string) {
    console.log('🔄 [NotificationService] Syncing tokens (Manual Trigger)...');

    // VoIP is iOS only
    if (Platform.OS === 'ios') {
      if (this.voipToken) {
        await this.registerVoipTokenWithBackend(this.voipToken, userId);
      } else {
        console.log(
          '📡 [VoIP] Token not found in memory, re-requesting iOS registration...',
        );
        if (
          VoIPPushNotification &&
          typeof (VoIPPushNotification as any).registerVoipToken === 'function'
        ) {
          (VoIPPushNotification as any).registerVoipToken();
        }
      }

      // Also trigger VoIP initialization if not done
      if (!this.isVoIPInitialized) {
        console.log(
          '🍎 [VoIP] VoIP not initialized on sync. Initializing now...',
        );
        await this.initializeVoIP();
      }
    }

    // Always refresh FCM token for both platforms
    await this.getFcmToken();
  }

  /**
   * Display Call Head-up/Full Screen Notification
   */
  async displayCallNotification(remoteMessage: any) {
    if (Platform.OS !== 'android') return;

    const data = remoteMessage.data || {};
    const {callerName, callId, type, callerId, sentAt} = data;
    const uuid = data.callUUID || generateUUID();

    // Check if call is too old (e.g., > 45 seconds) to prevent ghost calls
    if (sentAt && typeof sentAt === 'string') {
      const sentTime = parseInt(sentAt);
      const now = Date.now();
      if (now - sentTime > 45000) {
        console.log(
          `⏳ [NotificationService] Call ${callId} is too old (${
            now - sentTime
          }ms), ignoring.`,
        );
        return;
      }
    }

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
      const data = remoteMessage.data || {};
      const type = data.type;
      const sentAt = data.sentAt;

      console.log('📱 [NotificationService] Foreground message:', type);

      // Timestamp check for foreground too
      if (sentAt && typeof sentAt === 'string') {
        const diff = Date.now() - parseInt(sentAt);
        if (diff > 45000) {
          console.log(
            `⏳ [NotificationService] Foreground ${type} too old (${diff}ms), ignoring.`,
          );
          return;
        }
      }

      if (type === 'CALL_INCOMING') {
        console.log(
          '📞 [NotificationService] Call incoming in foreground, skipping banner.',
        );
      } else if (type === 'CALL_CANCELLED' || type === 'CALL_ENDED') {
        console.log(
          '🛑 [NotificationService] Call cancelled/ended, clearing notifications.',
        );
        await this.cancelAllCallNotifications();
      } else if (type === 'CHAT_MESSAGE') {
        console.log(
          '💬 [NotificationService] Chat message in foreground, skipping banner (Socket Toast will handle).',
        );
      } else {
        await this.displayForegroundNotification(remoteMessage);
      }
    });
  }

  async initialize() {
    await this.requestUserPermission();
    await ensureAndroidChannels();
    this.listenForForegroundMessages();

    if (Platform.OS === 'ios') {
      await this.initializeVoIP();
      // If already logged in, sync immediately
      const userData = await AsyncStorage.getItem('@flyconnect_user');
      if (userData) {
        await this.syncTokensAfterLogin();
      }
    }

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
              const {declineCallAPI} = require('./api');
              await declineCallAPI({
                callId: data.callId,
                callerId: data.callerId,
              });
            }
          } catch (err) {
            console.error(
              '❌ [Notifee] Failed to signal decline in foreground:',
              err,
            );
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

export default NotificationService;
