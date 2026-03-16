import React, {useEffect, useRef} from 'react';
import {NavigationContainer, NavigationContainerRef} from '@react-navigation/native';
import {StatusBar, LogBox} from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import {ProfileProvider} from './src/context/ProfileContext';
import {SocketProvider} from './src/context/SocketContext';
import {CallProvider} from './src/context/CallContext';
import NotificationService from './src/services/NotificationService';
import messaging from '@react-native-firebase/messaging';
import NotificationPermissionModal from './src/components/NotificationPermissionModal';
import {get} from './src/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Background handler MUST be registered outside of any component
// ─────────────────────────────────────────────────────────────────────────────
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('📨 Background FCM message received:', remoteMessage.data);
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

  // Handle Call Notifications first
  if (data.type === 'CALL_INCOMING') {
    navigationRef.navigate('IncomingCall', {
      callId: data.callId,
      channelName: data.channelName,
    });
    return;
  }

  try {
    // Fetch the sender's profile to pass to ChatScreen
    const response = await get<any>(`/api/v1/users/${data.senderId}`);
    const senderUser = response?.user ?? {
      _id: data.senderId,
      name: data.senderName || 'User',
      profileImage: data.senderImage || null,
    };
    navigationRef.navigate('ChatScreen', {user: senderUser});
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

import {navigationRef} from './src/navigation/RootNavigation';

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
            <NotificationPermissionModal />
            <AppNavigator />
          </NavigationContainer>
        </CallProvider>
      </SocketProvider>
    </ProfileProvider>
  );
};

export default App;
