import React, { useState, useEffect } from 'react';
import {
    Modal,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Animated,
    Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import NotificationService from '../services/NotificationService';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');
const SHOW_PERM_MODAL_PROGRESS = '@show_perm_modal_progress';

const NotificationPermissionModal = () => {
    const [visible, setVisible] = useState(false);
    const scaleAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        checkPermissionStatus();
    }, []);

    const checkPermissionStatus = async () => {
        try {
            // Check current firebase permission status
            const authStatus = await messaging().hasPermission();

            const isAuthorized =
                authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                authStatus === messaging.AuthorizationStatus.PROVISIONAL;

            if (!isAuthorized) {
                console.log('Firebase [UI]: Permission NOT granted. Displaying custom modal.');
                setVisible(true);
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 50,
                }).start();
            } else {
                console.log('Firebase [UI]: Permission already active. Modal suppressed.');
            }
        } catch (error) {
            console.error('Firebase [UI]: Error checking permission status:', error);
        }
    };

    const handleAllow = async () => {
        console.log('Firebase [UI]: User clicked Allow. Triggering system prompt...');
        await NotificationService.getInstance().requestUserPermission();
        closeModal();
    };

    const handleMaybeLater = () => {
        console.log('Firebase [UI]: User clicked Maybe Later. Modal closed.');
        closeModal();
    };

    const closeModal = () => {
        Animated.timing(scaleAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
        }).start(() => setVisible(false));
    };

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="fade">
            <View style={styles.overlay}>
                <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
                    <View style={styles.iconContainer}>
                        <LinearGradient
                            colors={['#6366F1', '#A855F7']}
                            style={styles.gradientCircle}
                        >
                            <Icon name="notifications" size={50} color="#fff" />
                        </LinearGradient>
                        <View style={styles.pulseDot} />
                    </View>

                    <Text style={styles.title}>Stay Updated!</Text>
                    <Text style={styles.description}>
                        Allow notifications to get real-time messages, call alerts, and important updates from your network.
                    </Text>

                    <TouchableOpacity style={styles.allowButton} onPress={handleAllow}>
                        <LinearGradient
                            colors={['#6366F1', '#A855F7']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.gradientButton}
                        >
                            <Text style={styles.allowButtonText}>Allow Notifications</Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.maybeLater} onPress={handleMaybeLater}>
                        <Text style={styles.maybeLaterText}>Maybe Later</Text>
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        width: width * 0.85,
        backgroundColor: '#FFFFFF',
        borderRadius: 30,
        padding: 30,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    iconContainer: {
        marginBottom: 25,
        position: 'relative',
    },
    gradientCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    pulseDot: {
        position: 'absolute',
        top: 5,
        right: 5,
        width: 15,
        height: 15,
        borderRadius: 7.5,
        backgroundColor: '#FF4B4B',
        borderWidth: 3,
        borderColor: '#FFF',
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 15,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 30,
    },
    allowButton: {
        width: '100%',
        height: 56,
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 15,
    },
    gradientButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    allowButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
    maybeLater: {
        padding: 10,
    },
    maybeLaterText: {
        color: '#9CA3AF',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default NotificationPermissionModal;
