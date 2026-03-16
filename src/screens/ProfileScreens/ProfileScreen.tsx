import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    Image,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
    Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useProfile } from '../../context/ProfileContext';
import { Colors, Shadows } from '../../theme/theme';
import LinearGradient from 'react-native-linear-gradient';
import { logout } from '../../services/authServices';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const ProfileScreen = () => {
    const { user, refreshProfile } = useProfile();
    const navigation = useNavigation<any>();

    const handleLogout = async () => {
        await logout();
        navigation.reset({
            index: 0,
            routes: [{ name: 'Welcome' }],
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* Header/Cover Section */}
                <View style={styles.header}>
                    <LinearGradient
                        colors={[Colors.primary, Colors.secondary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.coverGradient}
                    />

                    <View style={styles.profileCard}>
                        <View style={styles.imageContainer}>
                            <Image
                                source={{ uri: user?.profileImage || 'https://i.ibb.co/mcL9L2t/f10ff70a7155e5ab666bcdd1b45b726d.jpg' }}
                                style={styles.profileImage}
                            />
                            <TouchableOpacity style={styles.editImageBtn}>
                                <Icon name="camera" size={16} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.userName}>{user?.name || 'User Name'}</Text>
                        <Text style={styles.phoneNumber}>{user?.number || 'No Phone'}</Text>

                        {user?.verificationStatus && (
                            <View style={styles.verifiedBadge}>
                                <Icon name="checkmark-circle" size={14} color={Colors.secondary} />
                                <Text style={styles.verifiedText}>Verified Account</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Stats/Quick Actions */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>Posts</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>Friends</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>0</Text>
                        <Text style={styles.statLabel}>Groups</Text>
                    </View>
                </View>

                {/* Settings Options */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Account Settings</Text>

                    <TouchableOpacity style={styles.optionItem}>
                        <View style={[styles.optionIcon, { backgroundColor: '#E0E7FF' }]}>
                            <Icon name="person-outline" size={20} color={Colors.primary} />
                        </View>
                        <Text style={styles.optionText}>Edit Profile</Text>
                        <Icon name="chevron-forward" size={18} color={Colors.border} />
                    </TouchableOpacity>

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
    header: {
        paddingBottom: 20,
    },
    coverGradient: {
        height: 120,
        width: '100%',
    },
    profileCard: {
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        marginTop: -50,
        borderRadius: 24,
        padding: 20,
        alignItems: 'center',
        ...Shadows.default,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    imageContainer: {
        position: 'relative',
        marginBottom: 12,
    },
    profileImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        borderColor: '#FFF',
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
        fontSize: 22,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 2,
    },
    phoneNumber: {
        fontSize: 14,
        color: Colors.textSecondary,
        fontWeight: '500',
        marginBottom: 8,
    },
    verifiedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DCFCE7',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    verifiedText: {
        fontSize: 11,
        color: '#166534',
        fontWeight: '700',
    },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        borderRadius: 20,
        paddingVertical: 15,
        marginBottom: 25,
        ...Shadows.default,
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        height: '60%',
        backgroundColor: '#F1F5F9',
        alignSelf: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text,
    },
    statLabel: {
        fontSize: 12,
        color: Colors.textSecondary,
        marginTop: 2,
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