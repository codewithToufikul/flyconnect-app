import React, { useState, useRef } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Dimensions,
    Image,
    SafeAreaView,
    ScrollView,
    Animated,
    Pressable,
    DeviceEventEmitter,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import CountryPicker, { CountryCode, Country } from 'react-native-country-picker-modal';
import { login } from '../../services/authServices';
import { Colors, Shadows, Spacing } from '../../theme/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const LoginScreen = () => {
    const insets = useSafeAreaInsets();
    const [number, setNumber] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [numberFocused, setNumberFocused] = useState(false);
    const [passwordFocused, setPasswordFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Country Picker State
    const [countryCode, setCountryCode] = useState<CountryCode>('BD');
    const [callingCode, setCallingCode] = useState('880');
    const [showCountryPicker, setShowCountryPicker] = useState(false);

    const navigation = useNavigation<any>();

    // Refs for focus management
    const phoneInputRef = useRef<TextInput>(null);
    const passwordInputRef = useRef<TextInput>(null);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const onSelectCountry = (country: Country) => {
        setCountryCode(country.cca2);
        setCallingCode(country.callingCode[0]);
        setShowCountryPicker(false);
        // Focus the phone input after picking country
        setTimeout(() => phoneInputRef.current?.focus(), 100);
    };

    const onPressIn = () => {
        Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start();
    };
    const onPressOut = () => {
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
    };

    const handleLogin = async () => {
        if (!number || !password) {
            Alert.alert('Missing Info', 'Please enter both number and password');
            return;
        }
        setLoading(true);
        try {
            // Normalize number: if it starts with 0 and we have a calling code, strip the 0
            const sanitizedNumber = number.startsWith('0') ? number.slice(1) : number;
            const fullNumber = `+${callingCode}${sanitizedNumber}`;

            console.log('Logging in with:', fullNumber); // Debug log

            const data = await login({ number: fullNumber, password });
            if (data.success) {
                DeviceEventEmitter.emit('AUTH_UPDATED');
            }
        } catch (error: any) {
            Alert.alert('Login Failed', error.message || 'Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ ...styles.container, paddingTop: insets.top }}>

            {/* Decorative top-right blob */}
            <View style={styles.blobTopRight} pointerEvents="none">
                <LinearGradient
                    colors={['#3843D0', '#00D5A3']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            {/* Decorative bottom-left blob */}
            <View style={styles.blobBottomLeft} pointerEvents="none">
                <LinearGradient
                    colors={['#00D5A3', '#3843D0']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="always"
                >
                    {/* Back Button */}
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                        activeOpacity={0.7}
                    >
                        <Icon name="chevron-back" size={22} color={Colors.text} />
                    </TouchableOpacity>

                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.logoCard}>
                            <Image
                                source={require('../../assets/logo.png')}
                                style={styles.logo}
                                resizeMode="contain"
                            />
                        </View>

                        <Text style={styles.eyebrow}>WELCOME BACK</Text>
                        <Text style={styles.title}>Sign In</Text>

                        {/* Gradient accent bar under title */}
                        <View style={styles.accentBar}>
                            <LinearGradient
                                colors={[Colors.primary, Colors.secondary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={StyleSheet.absoluteFill}
                            />
                        </View>

                        <Text style={styles.subtitle}>
                            Sign in to continue to your account
                        </Text>
                    </View>

                    {/* Form Card */}
                    <View style={styles.formCard}>

                        {/* Phone Input with Country Picker */}
                        <View style={styles.inputWrapper}>
                            <Text style={styles.inputLabel}>Phone Number</Text>
                            <Pressable
                                onPress={() => phoneInputRef.current?.focus()}
                                style={[
                                    styles.inputContainer,
                                    numberFocused && styles.inputFocused,
                                ]}
                            >
                                <TouchableOpacity
                                    onPress={() => setShowCountryPicker(true)}
                                    style={styles.countryPickerWrap}
                                >
                                    <CountryPicker
                                        countryCode={countryCode}
                                        withFilter
                                        withFlag
                                        withCallingCode
                                        withEmoji
                                        onSelect={onSelectCountry}
                                        visible={showCountryPicker}
                                        onClose={() => setShowCountryPicker(false)}
                                    />
                                    <Text style={styles.callingCodeText}>+{callingCode}</Text>
                                    <View style={styles.smallDivider} />
                                </TouchableOpacity>

                                <TextInput
                                    ref={phoneInputRef}
                                    style={styles.input}
                                    placeholder="01xxxxxxxxx"
                                    placeholderTextColor={Colors.border}
                                    value={number}
                                    onChangeText={setNumber}
                                    keyboardType="phone-pad"
                                    autoCapitalize="none"
                                    onFocus={() => setNumberFocused(true)}
                                    onBlur={() => setNumberFocused(false)}
                                />
                            </Pressable>
                        </View>

                        {/* Password Input */}
                        <View style={styles.inputWrapper}>
                            <Text style={styles.inputLabel}>Password</Text>
                            <Pressable
                                onPress={() => passwordInputRef.current?.focus()}
                                style={[
                                    styles.inputContainer,
                                    passwordFocused && styles.inputFocused,
                                ]}
                            >
                                <View style={[
                                    styles.iconWrap,
                                    passwordFocused && styles.iconWrapFocused,
                                ]}>
                                    <Icon
                                        name="lock-closed-outline"
                                        size={18}
                                        color={passwordFocused ? Colors.primary : Colors.textSecondary}
                                    />
                                </View>
                                <TextInput
                                    ref={passwordInputRef}
                                    style={styles.input}
                                    placeholder="Enter your password"
                                    placeholderTextColor={Colors.border}
                                    secureTextEntry={!showPassword}
                                    value={password}
                                    onChangeText={setPassword}
                                    onFocus={() => setPasswordFocused(true)}
                                    onBlur={() => setPasswordFocused(false)}
                                />
                                <TouchableOpacity
                                    onPress={() => setShowPassword(!showPassword)}
                                    style={styles.eyeButton}
                                    activeOpacity={0.7}
                                >
                                    <Icon
                                        name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                                        size={20}
                                        color={Colors.textSecondary}
                                    />
                                </TouchableOpacity>
                            </Pressable>

                            <TouchableOpacity style={styles.forgotBtn} activeOpacity={0.7}>
                                <Text style={styles.forgotText}>Forgot Password?</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Sign In Button */}
                        <Animated.View style={[styles.buttonShadow, { transform: [{ scale: scaleAnim }] }]}>
                            <TouchableOpacity
                                onPress={handleLogin}
                                onPressIn={onPressIn}
                                onPressOut={onPressOut}
                                disabled={loading}
                                activeOpacity={1}
                            >
                                <LinearGradient
                                    colors={loading
                                        ? ['#8A90D8', '#8A90D8']
                                        : [Colors.primary, '#2D37B8']
                                    }
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.button}
                                >
                                    {loading ? (
                                        <Text style={styles.buttonText}>Signing In...</Text>
                                    ) : (
                                        <View style={styles.buttonInner}>
                                            <Text style={styles.buttonText}>Sign In</Text>
                                            <View style={styles.buttonArrow}>
                                                <Icon name="arrow-forward" size={16} color={Colors.primary} />
                                            </View>
                                        </View>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </Animated.View>

                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background, // #F8FAFC
    },

    // Decorative blobs
    blobTopRight: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        top: -100,
        right: -90,
        opacity: 0.09,
        overflow: 'hidden',
    },
    blobBottomLeft: {
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 90,
        bottom: 40,
        left: -60,
        opacity: 0.07,
        overflow: 'hidden',
    },

    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 50,
        flexGrow: 1,
    },

    // Back button
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: Colors.surface,
        borderWidth: 1.5,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 14,
        ...Shadows.default,
    },

    // Header
    header: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 30,
    },
    logoCard: {
        width: width * 0.22,
        height: width * 0.22,
        borderRadius: 24,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: Colors.border,
        marginBottom: 16,
        ...Shadows.default,
    },
    logo: {
        width: width * 0.18,
        height: width * 0.18,
    },
    eyebrow: {
        fontSize: 10,
        color: Colors.secondary,   // Mint green
        fontWeight: '700',
        letterSpacing: 4,
        marginBottom: 4,
    },
    title: {
        fontSize: 32,
        color: Colors.text,        // #1E293B
        fontWeight: '800',
        letterSpacing: -0.8,
        marginBottom: 6,
    },
    accentBar: {
        width: 40,
        height: 3,
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 14,
        color: Colors.textSecondary,  // #64748B
        fontWeight: '500',
    },

    // Form Card
    formCard: {
        backgroundColor: Colors.surface,   // #FFFFFF
        borderRadius: 28,
        padding: 20,
        borderWidth: 1.5,
        borderColor: Colors.border,        // #E2E8F0
        ...Shadows.default,
    },

    inputWrapper: {
        marginBottom: 18,
    },
    inputLabel: {
        color: Colors.text,
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 8,
        marginLeft: 2,
    },
    inputContainer: {
        height: 58,
        backgroundColor: Colors.background,  // #F8FAFC
        borderRadius: 16,
        paddingHorizontal: 12,
        borderWidth: 1.5,
        borderColor: Colors.border,
        flexDirection: 'row',
        alignItems: 'center',
    },
    inputFocused: {
        borderColor: Colors.primary,         // #3843D0
        backgroundColor: '#F0F1FB',
    },
    countryPickerWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 10,
    },
    callingCodeText: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
        marginLeft: 4,
    },
    smallDivider: {
        width: 1,
        height: 20,
        backgroundColor: Colors.border,
        marginLeft: 10,
    },
    iconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    iconWrapFocused: {
        backgroundColor: '#ECEEFE',
        borderColor: '#C5C8F0',
    },
    input: {
        flex: 1,
        color: Colors.text,
        fontSize: 16,
        fontWeight: '500',
        height: '100%',
    },
    eyeButton: {
        padding: 6,
    },
    forgotBtn: {
        alignSelf: 'flex-end',
        marginTop: 10,
    },
    forgotText: {
        color: Colors.primary,
        fontSize: 13,
        fontWeight: '600',
    },

    // Sign In Button
    buttonShadow: {
        marginTop: 6,
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 16,
        elevation: 10,
    },
    button: {
        height: 60,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    buttonArrow: {
        width: 30,
        height: 30,
        borderRadius: 9,
        backgroundColor: 'rgba(255,255,255,0.92)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // FlyBook Button
    flyBookButton: {
        height: 58,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: Colors.border,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    flyBookText: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '600',
    },
});

export default LoginScreen;