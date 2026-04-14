import React, { useState, useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View, Platform, ActivityIndicator, DeviceEventEmitter, Linking, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { BlurView } from '@react-native-community/blur';

import WelcomeScreen from '../screens/Auth/WelcomeScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import HomeScreen from '../screens/Main/HomeScreen';
import { getToken } from '../services/api';
import { Colors } from '../theme/theme';
import ProfileStack from './stacks/ProfileStack';
import CallsStack from './stacks/CallsStack';
import SearchStack from './stacks/SearchStack';
import ChatScreen from '../screens/Main/ChatScreen';
import ChatDetailScreen from '../screens/Main/ChatDetailScreen';
import IncomingCallScreen from '../screens/Calls/IncomingCallScreen';
import ActiveCallScreen from '../screens/Calls/ActiveCallScreen';
import PermissionScreen from '../screens/Auth/PermissionScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { check, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { useInbox } from '../context/InboxContext';
import { loginWithFlyBook } from '../services/authServices';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = () => {
    const { totalUnreadCount, totalMissedCallCount } = useInbox();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarBackground: () => (
                    Platform.OS === 'ios' ? (
                        <BlurView blurType="light" blurAmount={10} style={StyleSheet.absoluteFill} />
                    ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 25 }]} />
                    )
                ),
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.textSecondary,
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName = 'help-outline';
                    if (route.name === 'Chats') {
                        iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
                    } else if (route.name === 'Calls') {
                        iconName = focused ? 'call' : 'call-outline';
                    } else if (route.name === 'Search') {
                        iconName = focused ? 'search' : 'search-outline';
                    } else if (route.name === 'Profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    }
                    return <Icon name={iconName} size={size} color={color} />;
                },
            })}
        >
            <Tab.Screen 
                name="Chats" 
                component={HomeScreen} 
                options={{
                    tabBarBadge: totalUnreadCount > 0 ? totalUnreadCount : undefined,
                    tabBarBadgeStyle: { backgroundColor: Colors.primary, fontSize: 10 },
                }}
            />
            <Tab.Screen 
                name="Calls" 
                component={CallsStack} 
                options={{
                    tabBarBadge: totalMissedCallCount > 0 ? totalMissedCallCount : undefined,
                    tabBarBadgeStyle: { backgroundColor: Colors.error, fontSize: 10 },
                }}
            />
            <Tab.Screen name="Search" component={SearchStack} />
            <Tab.Screen name="Profile" component={ProfileStack} />
        </Tab.Navigator>
    );
};

const AppNavigator = () => {
    const [isLoading, setIsLoading] = useState(true);
    const [userToken, setUserToken] = useState<string | null>(null);
    const [permissionsHandled, setPermissionsHandled] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const [token, permissionsFlag] = await Promise.all([
                    getToken(),
                    AsyncStorage.getItem('@permissions_handled')
                ]);
                
                console.log('AppNavigator: checkAuth - token:', !!token, 'permissionsFlag:', permissionsFlag);

                let allGranted = permissionsFlag === 'true';
                
                // Real-time verification for security
                if (allGranted && Platform.OS === 'android') {
                    try {
                        const [mic, cam, phoneState, phoneNumbers] = await Promise.all([
                            check(PERMISSIONS.ANDROID.RECORD_AUDIO),
                            check(PERMISSIONS.ANDROID.CAMERA),
                            check(PERMISSIONS.ANDROID.READ_PHONE_STATE),
                            check((PERMISSIONS.ANDROID as any).READ_PHONE_NUMBERS || 'android.permission.READ_PHONE_NUMBERS')
                        ]);

                        const isSet = (s: string) => s === RESULTS.GRANTED || s === RESULTS.LIMITED || s === RESULTS.UNAVAILABLE;
                        const isPhoneGranted = isSet(phoneState) || isSet(phoneNumbers);

                        if (!isSet(mic) || !isSet(cam) || !isPhoneGranted) {
                            console.log('AppNavigator: Blocking real-time permissions check:', { mic, cam, phoneState, phoneNumbers });
                            allGranted = false;
                        }
                    } catch (e) {
                        console.warn('Real-time permission check failed (safe fallback to granted):', e);
                    }
                }

                console.log('AppNavigator: Final state - userToken:', !!token, 'permissionsHandled:', allGranted);
                setUserToken(token);
                setPermissionsHandled(allGranted);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();

        // Listen for internal state updates (e.g. from PermissionScreen)
        const sub = DeviceEventEmitter.addListener('PERMISSIONS_UPDATED', checkAuth);
        const subAuth = DeviceEventEmitter.addListener('AUTH_UPDATED', checkAuth);

        return () => {
            sub.remove();
            subAuth.remove();
        };
    }, []);

    // --- Global Deep Link SSO Handler ---
    useEffect(() => {
        const handleIncomingUrl = async (event: { url: string }) => {
            const { url } = event;
            console.log('🔗 [SSO-DeepLink] Incoming URL in AppNavigator:', url);

            if (url.includes('flyconnect://auth')) {
                try {
                    const dataStr = url.split('data=')[1];
                    if (!dataStr) return;

                    const decodedData = JSON.parse(decodeURIComponent(dataStr));
                    const { token: flyBookToken, target } = decodedData;

                    console.log('🎯 [SSO-DeepLink] Parsed target:', target);

                    if (target) {
                        await AsyncStorage.setItem('@pending_nav_target', target);
                    }

                    // CASE 1: User is already logged in
                    if (userToken) {
                        console.log('✅ [SSO-DeepLink] Already logged in, triggering navigation...');
                        if (target && target.includes('chat:')) {
                            const userId = target.split(':')[1];
                            // Direct emit. HomeScreen or current active screen will catch this
                            DeviceEventEmitter.emit('NAVIGATE_TO_CHAT', { userId });
                        }
                    } 
                    // CASE 2: User needs to log in via SSO
                    else if (flyBookToken) {
                        console.log('🔄 [SSO-DeepLink] Need SSO login, exchanging token...');
                        DeviceEventEmitter.emit('SSO_LOADING', true);
                        try {
                            const result = await loginWithFlyBook(flyBookToken);
                            if (result.success) {
                                DeviceEventEmitter.emit('AUTH_UPDATED');
                            } else {
                                Alert.alert('SSO Error', result.message || 'Failed to sync with FlyBook');
                            }
                        } finally {
                            DeviceEventEmitter.emit('SSO_LOADING', false);
                        }
                    }
                } catch (e) {
                    console.error('❌ [SSO-DeepLink] Handler Error:', e);
                }
            }
        };

        const sub = Linking.addEventListener('url', handleIncomingUrl);
        
        // Handle background launch/cold start
        Linking.getInitialURL().then(url => {
            if (url) handleIncomingUrl({ url });
        });

        return () => sub.remove();
    }, [userToken]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <Stack.Navigator 
            key={permissionsHandled ? (userToken ? 'authorized' : 'unauthorized') : 'permissions'}
            screenOptions={{ headerShown: false }}
        >
            {!permissionsHandled ? (
                <Stack.Screen name="Permissions" component={PermissionScreen} />
            ) : !userToken ? (
                <>
                    <Stack.Screen name="Welcome" component={WelcomeScreen} />
                    <Stack.Screen name="Auth" component={LoginScreen} />
                </>
            ) : (
                <>
                    <Stack.Screen name="Main" component={MainTabs} />
                    <Stack.Screen
                        name="ChatScreen"
                        component={ChatScreen}
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="ChatDetail"
                        component={ChatDetailScreen}
                        options={{ headerShown: false }}
                    />
                    <Stack.Screen
                        name="IncomingCall"
                        component={IncomingCallScreen}
                        options={{ headerShown: false, gestureEnabled: false }}
                    />
                    <Stack.Screen
                        name="ActiveCall"
                        component={ActiveCallScreen}
                        options={{ headerShown: false, gestureEnabled: false }}
                    />
                </>
            )}
        </Stack.Navigator>
    );
};

const styles = StyleSheet.create({
    tabBar: {
        position: 'absolute',
        bottom: 25,
        left: 20,
        right: 20,
        height: 70,
        borderRadius: 25,
        borderTopWidth: 0,
        backgroundColor: 'transparent',
        elevation: 0,
        paddingBottom: 10,
    },
});

export default AppNavigator;
