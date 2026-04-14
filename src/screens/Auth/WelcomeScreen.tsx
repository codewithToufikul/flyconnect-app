import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    Image,
    Dimensions,
    SafeAreaView,
    ActivityIndicator,
    Alert,
    DeviceEventEmitter,
    Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Shadows } from '../../theme/theme';
import { loginWithFlyBook } from '../../services/authServices';

const { width } = Dimensions.get('window');

const WelcomeScreen = () => {
    const navigation = useNavigation<any>();

    // Loading state while we exchange the FlyBook token for a FlyConnect token
    const [isSSOLoading, setIsSSOLoading] = React.useState(false);

    React.useEffect(() => {
        // We now handle deep links globally in AppNavigator.tsx
        // But we listen for the 'SSO_LOADING' event if we want to show a spinner here
        const sub = DeviceEventEmitter.addListener('SSO_LOADING', (loading: boolean) => {
            setIsSSOLoading(loading);
        });
        return () => sub.remove();
    }, []);

    const handleFlyBookSignInPress = async () => {
        const url = 'flybook://sso-auth?callback=flyconnect';
        console.log('🚀 [SSO] Requesting FlyBook SSO...');
        const supported = await Linking.canOpenURL(url);

        if (supported) {
            await Linking.openURL(url);
        } else {
            Alert.alert(
                'FlyBook Not Found',
                'Please install the FlyBook app to use this feature.',
                [{ text: 'OK' }]
            );
        }
    };



    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>

                {/* Center section: logo + buttons */}
                <View style={styles.centerSection}>
                    {/* Logo Section */}
                    <View style={styles.logoSection}>
                        <Image
                            source={require('../../assets/logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.tagline}>Next Gen Communication</Text>
                    </View>

                    {/* Button Section */}
                    <View style={styles.buttonSection}>
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={() => navigation.navigate('Auth')}
                            activeOpacity={0.8}
                        >
                            <LinearGradient
                                colors={Colors.gradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.gradient}
                            >
                                <Text style={styles.primaryButtonText}>Sign In</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.secondaryButton, isSSOLoading && styles.secondaryButtonDisabled]}
                            onPress={handleFlyBookSignInPress}
                            activeOpacity={0.8}
                            disabled={isSSOLoading}
                        >
                            {isSSOLoading ? (
                                <ActivityIndicator color={Colors.primary} style={styles.buttonIcon} />
                            ) : (
                                <Icon name="at-circle-outline" size={24} color={Colors.primary} style={styles.buttonIcon} />
                            )}
                            <Text style={styles.secondaryButtonText}>
                                {isSSOLoading ? 'Signing in...' : 'Sign In with FlyBook'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>



                {/* Footer - pinned to bottom */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>
                        By continuing, you agree to our{' '}
                        <Text style={styles.footerLink}>Terms of Service</Text>
                    </Text>
                </View>

            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        flex: 1,
        paddingHorizontal: 30,
        paddingBottom: 30,
        paddingTop: 20,
    },
    // Takes all available space and centers logo+buttons vertically
    centerSection: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 48,
    },
    logoSection: {
        alignItems: 'center',
        gap: 8, // tight gap between logo and tagline
    },
    logo: {
        width: width * 0.55,
        height: width * 0.55,
    },
    tagline: {
        fontSize: 16,
        color: Colors.textSecondary,
        fontWeight: '500',
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    buttonSection: {
        width: '100%',
        gap: 16,
    },
    primaryButton: {
        width: '100%',
        height: 60,
        borderRadius: 18,
        ...Shadows.primary,
    },
    gradient: {
        flex: 1,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
    secondaryButton: {
        width: '100%',
        height: 60,
        borderRadius: 18,
        backgroundColor: Colors.surface,
        borderWidth: 1.5,
        borderColor: Colors.border,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        ...Shadows.default,
    },
    secondaryButtonDisabled: {
        opacity: 0.6,
    },
    buttonIcon: {
        marginRight: 10,
    },
    secondaryButtonText: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '600',
    },
    // Pinned to bottom naturally since centerSection takes flex: 1
    footer: {
        alignItems: 'center',
    },
    footerText: {
        color: Colors.textSecondary,
        fontSize: 13,
        textAlign: 'center',
    },
    footerLink: {
        color: Colors.primary,
        fontWeight: '600',
    },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        ...Shadows.default,
    },
    modalHeader: {
        alignItems: 'center',
        marginBottom: 24,
    },
    modalIndicator: {
        width: 40,
        height: 5,
        backgroundColor: Colors.border,
        borderRadius: 3,
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.text,
    },
    accountCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: Colors.border,
        marginBottom: 24,
    },
    modalAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        marginRight: 16,
        borderWidth: 2,
        borderColor: Colors.primary,
    },
    accountInfo: {
        flex: 1,
    },
    accountName: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 4,
    },
    accountStatus: {
        fontSize: 13,
        color: Colors.secondary,
        fontWeight: '600',
    },
    modalPrimaryButton: {
        height: 60,
        backgroundColor: Colors.primary,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        ...Shadows.primary,
    },
    modalPrimaryButtonText: {
        color: '#FFF',
        fontSize: 17,
        fontWeight: '700',
    },
    modalSecondaryButton: {
        height: 60,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalSecondaryButtonText: {
        color: Colors.textSecondary,
        fontSize: 16,
        fontWeight: '600',
    },
});

export default WelcomeScreen;