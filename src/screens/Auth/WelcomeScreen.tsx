import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    Image,
    Dimensions,
    SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import { Colors, Shadows } from '../../theme/theme';

const { width } = Dimensions.get('window');

const WelcomeScreen = () => {
    const navigation = useNavigation<any>();

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
                            style={styles.secondaryButton}
                            onPress={() => { }} // Integration for FlyBook later
                            activeOpacity={0.8}
                        >
                            <Icon name="at-circle-outline" size={24} color={Colors.primary} style={styles.buttonIcon} />
                            <Text style={styles.secondaryButtonText}>Sign In with FlyBook</Text>
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
});

export default WelcomeScreen;