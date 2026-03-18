import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { StatusBar, LogBox, Platform } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { ProfileProvider } from './src/context/ProfileContext';
import { SocketProvider } from './src/context/SocketContext';
import { CallProvider } from './src/context/CallContext';
import NotificationService from './src/services/NotificationService';
import messaging from '@react-native-firebase/messaging';
import { get, declineCallAPI } from './src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Background handler MUST be registered outside of any component
// ─────────────────────────────────────────────────────────────────────────────
import RNCallKeep from 'react-native-callkeep';
import CallKeepService from './src/services/CallKeepService';

import notifee, { EventType } from '@notifee/react-native';

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

  if (type === 'CALL_INCOMING') {
    const data = remoteMessage.data as any;
    const { callId, callerName, callerId, callType } = data || {};
    const uuid = generateUUID();

    // Save to AsyncStorage for the main app process to see on mount
    await AsyncStorage.setItem('@pending_call_data', JSON.stringify({
      callId,
      callerName,
      callerId,
      callType: callType || 'audio',
      callUUID: uuid,
      timestamp: Date.now()
    }));

    // We only display the Notifee notification in the background to avoid duplicates.
    await NotificationService.displayCallNotification({
      ...remoteMessage,
      data: { ...remoteMessage.data, callUUID: uuid }
    });
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
    
    // Clear notification immediately since we're answering
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
    RNCallKeep.endAllCalls();
    if (notification?.id) {
      await notifee.cancelNotification(notification.id);
    }
  }

  if (type === EventType.PRESS) {
    console.log('📱 [Notifee-BG] Tapped body');

    await AsyncStorage.setItem('@pending_call_action', JSON.stringify({
      action: 'tapped',
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
    
    // Clear notification immediately since we're declining
    if (notification?.id) {
       await notifee.cancelNotification(notification.id);
    }

    try {
      const data = notification?.data as any;
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

LogBox.ignoreLogs(['Warning: CountryModal: Support for defaultProps']);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build the user object from notification data and navigate to chat
// ─────────────────────────────────────────────────────────────────────────────
async function navigateToChat(
  navigationRef: NavigationContainerRef<any>,
  data: Record<string, string> | undefined,
) {
  if (!data?.senderId) return;

  // Handles normal chat message navigation
  try {
    // Fetch the sender's profile to pass to ChatScreen
    const response = await get<any>(`/api/v1/users/${data.senderId}`);
    const senderUser = response?.user ?? {
      _id: data.senderId,
      name: data.senderName || 'User',
      profileImage: data.senderImage || null,
    };
    navigationRef.navigate('ChatScreen', { user: senderUser });
  } catch {
    // Fallback: navigate with minimal data from notification payload
    navigationRef.navigate('ChatScreen', {
      user: {
        _id: data.senderId,
        name: data.senderName || 'User',
        profileImage: data.senderImage || null,
      },
    });
  }
}

import { navigationRef } from './src/navigation/RootNavigation';

const App = () => {

  useEffect(() => {
    // Initialize FCM token registration + foreground listener
    NotificationService.initialize();

    // ── Foreground tap listener (app is OPEN and user taps notification) ──
    // Note: foreground messages are handled inside NotificationService.
    // This listener handles taps on notifications shown by the OS when app is open.

    // ── Background tap listener (app is in BACKGROUND, user taps notification) ──
    const unsubscribeBackground = messaging().onNotificationOpenedApp(
      remoteMessage => {
        console.log(
          '📲 Notification tapped (background):',
          remoteMessage.data,
        );
        if (navigationRef.current?.isReady()) {
          navigateToChat(navigationRef.current, remoteMessage.data as Record<string, string>);
        }
      },
    );

    // ── Quit state (app was fully closed, user taps notification to open) ──
    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          console.log(
            '📲 Notification tapped (quit state):',
            remoteMessage.data,
          );
          // Small delay to let Navigation mount first
          setTimeout(() => {
            if (navigationRef.current?.isReady()) {
              navigateToChat(navigationRef.current, remoteMessage.data as Record<string, string>);
            }
          }, 1000);
        }
      });

    return () => {
      unsubscribeBackground();
    };
  }, []);

  return (
    <ProfileProvider>
      <SocketProvider>
        <CallProvider>
          <NavigationContainer ref={navigationRef}>
            <StatusBar
              barStyle="dark-content"
              translucent
              backgroundColor="transparent"
            />
            <AppNavigator />
          </NavigationContainer>
        </CallProvider>
      </SocketProvider>
    </ProfileProvider>
  );
};

export default App;
