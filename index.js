import 'react-native-gesture-handler';
/**
 * @format
 */

import {AppRegistry, Platform} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import RNCallKeep from 'react-native-callkeep';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NotificationService from './src/services/NotificationService';
import { declineCallAPI } from './src/services/api';

// Simple UUID generator for background scope
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Unified CallKeep Setup (Must run once for both UI and Background processes)
// ─────────────────────────────────────────────────────────────────────────────
const callKeepOptions = {
  ios: { appName: 'FlyConnect' },
  android: {
    alertTitle: 'Permissions required',
    alertDescription: 'This application needs to access your phone accounts',
    cancelButton: 'Cancel',
    okButton: 'ok',
    imageName: 'phone_account_icon',
    additionalPermissions: [],
    selfManaged: true,
  },
};

RNCallKeep.setup(callKeepOptions);
RNCallKeep.setAvailable(true);
if (Platform.OS === 'android') {
  RNCallKeep.registerPhoneAccount(callKeepOptions);
  RNCallKeep.registerAndroidEvents();
}

// ─────────────────────────────────────────────────────────────────────────────
// Background FCM handler
// ─────────────────────────────────────────────────────────────────────────────
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('🌌 [FCM] Killed/Background message:', remoteMessage.data);

  const type = remoteMessage.data?.type;

  // ─────────────────────────────────────────────────────────────────────────
  // iOS NOTE:
  // setBackgroundMessageHandler is NOT called on iOS in killed (quit) state.
  // For killed-state iOS calls we rely on:
  //   1. Server sends an APNs alert push (notification.service.ts)
  //   2. User taps the banner → app launches
  //   3. App.tsx > getInitialNotification() reads the data and restores
  //      the call session via AsyncStorage → CallContext.
  //
  // This handler IS called on iOS when the app is in the background (not killed).
  // We still save pending call data for that case, but we do NOT show a
  // Notifee notification on iOS here — the APNs alert already showed a banner.
  // ─────────────────────────────────────────────────────────────────────────

  if (type === 'CALL_INCOMING') {
    const data = remoteMessage.data;
    const { callId, callerName, callerId, callType } = data || {};
    const uuid = generateUUID();

    // Ghost-call guard: ignore if push is older than 45 s
    if (data?.sentAt) {
      const age = Date.now() - parseInt(data.sentAt, 10);
      if (age > 45000) {
        console.log(`⏳ [FCM-BG] Call ${callId} too old (${age}ms), ignoring.`);
        return;
      }
    }

    // Save to AsyncStorage so the main app process can pick it up on mount
    await AsyncStorage.setItem('@pending_call_data', JSON.stringify({
      callId,
      callerName,
      callerId,
      callType: callType || 'audio',
      callUUID: uuid,
      timestamp: Date.now(),
    }));

    if (Platform.OS === 'android') {
      // Android: show Notifee full-screen/heads-up call notification
      await NotificationService.displayCallNotification({
        ...remoteMessage,
        data: { ...remoteMessage.data, callUUID: uuid },
      });
    } else {
      // iOS background (not killed): the APNs alert banner was already shown
      // by the server-sent alert push.  Just trigger the native CallKit UI.
      RNCallKeep.displayIncomingCall(uuid, callerName, callerName, 'number', callType === 'video');
    }

  } else if (type === 'CALL_CANCELLED' || type === 'CALL_ENDED') {
    console.log('🛑 [FCM] Call cancelled/ended, clearing notifications.');
    await notifee.cancelAllNotifications();
    RNCallKeep.endAllCalls();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Notifee Background event handler
// ─────────────────────────────────────────────────────────────────────────────
notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;

  console.log('🌌 [Notifee-BG] Event:', type, pressAction?.id);

  if (type === EventType.PRESS) {
    if (notification?.id) {
       await notifee.cancelNotification(notification.id);
    }
  }

  if (type === EventType.ACTION_PRESS && pressAction?.id === 'answer') {
    console.log('📞 [Notifee-BG] Answer clicked');
    
    if (notification?.id) {
       await notifee.cancelNotification(notification.id);
    }

    await AsyncStorage.setItem('@pending_call_action', JSON.stringify({
      action: 'answered',
      callId: notification?.data?.callId,
      callerName: notification?.data?.callerName,
      callerId: notification?.data?.callerId,
      callUUID: notification?.data?.callUUID,
      callType: notification?.data?.callType || 'audio'
    }));

    RNCallKeep.backToForeground();
  }

  if (type === EventType.ACTION_PRESS && pressAction?.id === 'decline') {
    console.log('🛑 [Notifee-BG] Decline clicked');
    
    if (notification?.id) {
       await notifee.cancelNotification(notification.id);
    }

    try {
      const data = notification?.data;
      if (data?.callId && data?.callerId) {
        await declineCallAPI({
          callId: data.callId,
          callerId: data.callerId
        });
      }
    } catch (err) {
      console.error('❌ [Notifee-BG] Failed to signal decline:', err);
    }

    RNCallKeep.endAllCalls();
  }
});

AppRegistry.registerComponent(appName, () => App);
