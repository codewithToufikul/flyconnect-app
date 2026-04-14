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
import { ToastProvider } from './src/context/ToastContext';
import InAppToast from './src/components/InAppToast';
import { InboxProvider } from './src/context/InboxContext';
import notifee from '@notifee/react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build the user object from notification data and navigate to chat
// ─────────────────────────────────────────────────────────────────────────────
async function navigateToChat(
  navigationRef: NavigationContainerRef<any>,
  data: Record<string, string> | undefined,
) {
  if (!data?.senderId) return;

  try {
    const response = await get<any>(`/api/v1/users/${data.senderId}`);
    const senderUser = response?.user ?? {
      _id: data.senderId,
      name: data.senderName || 'User',
      profileImage: data.senderImage || null,
    };
    navigationRef.navigate('ChatScreen', { user: senderUser });
  } catch {
    navigationRef.navigate('ChatScreen', {
      user: {
        _id: data.senderId,
        name: data.senderName || 'User',
        profileImage: data.senderImage || null,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: iOS killed-state call handling
// iOS-এ setBackgroundMessageHandler killed state-এ কাজ করে না।
// তাই notification tap হলে getInitialNotification() থেকে call data পড়ে
// AsyncStorage-এ save করা হয়, CallContext mount হলে সেটা process করে।
// ─────────────────────────────────────────────────────────────────────────────
async function handleCallNotificationTap(
  data: Record<string, string> | undefined,
): Promise<boolean> {
  if (!data || data.type !== 'CALL_INCOMING') return false;

  const { callId, callerId, callerName, callType, callUUID } = data;
  if (!callId) return false;

  // Check if the call is still fresh (under 45 seconds)
  if (data.sentAt) {
    const age = Date.now() - parseInt(data.sentAt, 10);
    if (age > 45000) {
      console.log(`[iOS-Call] Call ${callId} is too old (${age}ms), ignoring.`);
      return false;
    }
  }

  console.log(`[iOS-Call] 📞 Restoring call session from notification tap: ${callId}`);

  // Save to AsyncStorage — CallContext reads this on mount / foreground
  await AsyncStorage.setItem('@pending_call_data', JSON.stringify({
    callId,
    callerName: callerName || 'Someone',
    callerId: callerId || '',
    callType: callType || 'audio',
    callUUID: callUUID || '',
    timestamp: Date.now(),
  }));

  return true;
}

import { navigationRef } from './src/navigation/RootNavigation';

const linking = {
  prefixes: ['flyconnect://'],
  config: {
    screens: {
      ChatScreen: 'chat/:userId',
    },
  },
};

import { GestureHandlerRootView } from 'react-native-gesture-handler';

const App = () => {

  useEffect(() => {
    // Initialize FCM token registration + foreground listener
    NotificationService.getInstance().initialize();

    // ── Background tap: app was in background, user taps notification ──
    const unsubscribeBackground = messaging().onNotificationOpenedApp(
      async remoteMessage => {
        const data = remoteMessage.data as Record<string, string> | undefined;
        console.log('📲 [App] Notification tapped (background):', data?.type);

        if (data?.type === 'CALL_INCOMING') {
          // iOS background: call data-এ save করো, CallContext process করবে
          await handleCallNotificationTap(data);
        } else {
          if (navigationRef.current?.isReady()) {
            navigateToChat(navigationRef.current, data);
          }
        }
      },
    );

    // ── Quit / Killed state: app was fully closed, user taps notification ──
    // iOS-এ killed state-এ setBackgroundMessageHandler কাজ করে না।
    // এখানেই পুরো iOS call notification handling করতে হয়।
    messaging()
      .getInitialNotification()
      .then(async remoteMessage => {
        if (!remoteMessage) return;
        const data = remoteMessage.data as Record<string, string> | undefined;
        console.log('📲 [App] Notification tapped (quit state):', data?.type);

        if (data?.type === 'CALL_INCOMING') {
          // iOS killed state call: save করো, CallContext mount হলে process করবে
          const handled = await handleCallNotificationTap(data);
          if (handled) {
            // Cancel the Notifee notification যদি থাকে
            try { await notifee.cancelAllNotifications(); } catch (_) {}
          }
        } else {
          // Chat message notification
          setTimeout(() => {
            if (navigationRef.current?.isReady()) {
              navigateToChat(navigationRef.current, data);
            }
          }, 1000);
        }
      });

    // ── iOS: Notifee initial notification (app opened via Notifee full-screen) ──
    if (Platform.OS === 'ios') {
      notifee.getInitialNotification().then(async initialNotif => {
        if (!initialNotif) return;
        const data = initialNotif.notification?.data as Record<string, string> | undefined;
        console.log('📲 [App] Notifee initial notification (iOS):', data?.type);

        if (data?.type === 'CALL_INCOMING') {
          await handleCallNotificationTap(data);
        }
      });
    }

    return () => {
      unsubscribeBackground();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProfileProvider>
        <ToastProvider>
          <SocketProvider>
            <CallProvider>
              <InboxProvider>
                <NavigationContainer ref={navigationRef} linking={linking}>
                  <StatusBar
                    barStyle="dark-content"
                    translucent
                    backgroundColor="transparent"
                  />
                  <AppNavigator />
                  <InAppToast />
                </NavigationContainer>
              </InboxProvider>
            </CallProvider>
          </SocketProvider>
        </ToastProvider>
      </ProfileProvider>
    </GestureHandlerRootView>
  );
};

export default App;
