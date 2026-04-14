import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    Image,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Linking,
    Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useProfile } from '../../context/ProfileContext';
import { Colors, Shadows } from '../../theme/theme';
import LinearGradient from 'react-native-linear-gradient';
import { logout } from '../../services/authServices';
import { useNavigation } from '@react-navigation/native';
import { DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

const ProfileScreen = () => {
    const { user, refreshProfile } = useProfile();
    const navigation = useNavigation<any>();

    const handleLogout = async () => {
        await logout();
        // Emit event to notify AppNavigator to re-check token and unmount main stack
        DeviceEventEmitter.emit('AUTH_UPDATED');
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Simple Header Section */}
                <View style={styles.profileHeader}>
                    <View style={styles.imageContainer}>
                        <Image
                            source={{ uri: user?.profileImage || 'https://i.ibb.co/mcL9L2t/f10ff70a7155e5ab666bcdd1b45b726d.jpg' }}
                            style={styles.profileImage}
                        />
                    </View>

                    <Text style={styles.userName}>{user?.name || 'User Name'}</Text>
                    {user?.userName && <Text style={styles.userNameSub}>@{user.userName}</Text>}

                    {user?.verificationStatus && (
                        <View style={styles.verifiedBadge}>
                            <Icon name="checkmark-circle" size={14} color={Colors.secondary} />
                            <Text style={styles.verifiedText}>Verified Account</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={styles.flybookBtn}
                        onPress={() => Linking.openURL(`https://flybook.app/profile/${user?.userName || ''}`)}
                    >
                        <LinearGradient
                            colors={[Colors.primary, '#4F46E5']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.flybookGradient}
                        >
                            <Icon name="globe-outline" size={18} color="#FFF" />
                            <Text style={styles.flybookBtnText}>Go to Flybook Profile</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>


                {/* Settings Options */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Account Settings</Text>


                    <TouchableOpacity style={styles.optionItem}>
                        <View style={[styles.optionIcon, { backgroundColor: '#DCFCE7' }]}>
                            <Icon name="notifications-outline" size={20} color="#166534" />
                        </View>
                        <Text style={styles.optionText}>Notifications</Text>
                        <Icon name="chevron-forward" size={18} color={Colors.border} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.optionItem}>
                        <View style={[styles.optionIcon, { backgroundColor: '#FEF3C7' }]}>
                            <Icon name="shield-checkmark-outline" size={20} color="#92400E" />
                        </View>
                        <Text style={styles.optionText}>Privacy & Security</Text>
                        <Icon name="chevron-forward" size={18} color={Colors.border} />
                    </TouchableOpacity>
                </View>

                {/* More Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>More</Text>

                    <TouchableOpacity style={styles.optionItem} onPress={refreshProfile}>
                        <View style={[styles.optionIcon, { backgroundColor: '#F1F5F9' }]}>
                            <Icon name="sync-outline" size={20} color={Colors.textSecondary} />
                        </View>
                        <Text style={styles.optionText}>Refresh Data</Text>
                        <Icon name="chevron-forward" size={18} color={Colors.border} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.optionItem} onPress={handleLogout}>
                        <View style={[styles.optionIcon, { backgroundColor: '#FEE2E2' }]}>
                            <Icon name="log-out-outline" size={20} color="#991B1B" />
                        </View>
                        <Text style={[styles.optionText, { color: '#991B1B' }]}>Logout</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.versionText}>FlyConnect Version 1.0.0</Text>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    profileHeader: {
        backgroundColor: '#FFF',
        paddingVertical: 40,
        alignItems: 'center',
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        ...Shadows.default,
        marginBottom: 20,
    },
    imageContainer: {
        marginBottom: 16,
    },
    profileImage: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 4,
        borderColor: '#F1F5F9',
    },
    flybookBtn: {
        marginTop: 20,
        width: '65%',
        borderRadius: 14,
        overflow: 'hidden',
        ...Shadows.default,
    },
    flybookGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 10,
    },
    flybookBtnText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
    },
    editImageBtn: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        backgroundColor: Colors.primary,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#FFF',
    },
    userName: {
        fontSize: 24,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 2,
    },
    userNameSub: {
        fontSize: 15,
        color: Colors.textSecondary,
        fontWeight: '500',
        marginBottom: 12,
    },
    verifiedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DCFCE7',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    verifiedText: {
        fontSize: 12,
        color: '#166534',
        fontWeight: '700',
    },
    section: {
        marginHorizontal: 20,
        marginBottom: 25,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 12,
        marginLeft: 4,
    },
    optionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 12,
        borderRadius: 16,
        marginBottom: 10,
        ...Shadows.default,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    optionIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    optionText: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    versionText: {
        textAlign: 'center',
        fontSize: 12,
        color: Colors.border,
        marginBottom: 30,
        fontWeight: '500',
    },
});

export default ProfileScreen;