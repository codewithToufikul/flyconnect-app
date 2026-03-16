import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar, LogBox } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { ProfileProvider } from './src/context/ProfileContext';
import { SocketProvider } from './src/context/SocketContext';
import NotificationService from './src/services/NotificationService';
import messaging from '@react-native-firebase/messaging';
import NotificationPermissionModal from './src/components/NotificationPermissionModal';

// Register background handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
});

// Ignore specific third-party library warnings for a cleaner console
LogBox.ignoreLogs(['Warning: CountryModal: Support for defaultProps']);

const App = () => {
  React.useEffect(() => {
    NotificationService.initialize();
  }, []);

  return (
    <ProfileProvider>
      <SocketProvider>
        <NavigationContainer>
          <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
          <NotificationPermissionModal />
          <AppNavigator />
        </NavigationContainer>
      </SocketProvider>
    </ProfileProvider>
  );
};

export default App;
