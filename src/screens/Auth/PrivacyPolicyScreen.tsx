import React from 'react';
import {
    StyleSheet,
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/theme';

const PrivacyPolicyScreen = () => {
    const navigation = useNavigation();

    const sections = [
        {
            title: '1. Information We Collect',
            content: 'We collect information you provide directly to us, such as when you create an account, update your profile, or communicate with other users. This includes your phone number, name, and profile picture.',
        },
        {
            title: '2. How We Use Information',
            content: 'We use the information we collect to provide, maintain, and improve our services, including to facilitate communication between users, provide customer support, and personalize your experience.',
        },
        {
            title: '3. Real-Time Communication',
            content: 'FlyConnect uses end-to-end encryption for messaging and calling where possible. Your media (images, videos, voice notes) is stored securely and only accessible to the intended recipients.',
        },
        {
            title: '4. Data Security',
            content: 'We take reasonable measures to protect your personal information from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction.',
        },
        {
            title: '5. Changes to the Policy',
            content: 'We may update this Privacy Policy from time to time. If we make changes, we will notify you by revising the date at the top of the policy.',
        },
    ];

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Icon name="chevron-back" size={28} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Privacy Policy</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.introSection}>
                    <Text style={styles.lastUpdated}>Last Updated: Apr 2026</Text>
                    <Text style={styles.introText}>
                        Welcome to FlyConnect. Your privacy is critically important to us. This policy explains how we handle your data within the application.
                    </Text>
                </View>

                {sections.map((section, index) => (
                    <View key={index} style={styles.section}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Text style={styles.sectionContent}>{section.content}</Text>
                    </View>
                ))}

                <View style={styles.contactSection}>
                    <Text style={styles.contactTitle}>Have questions?</Text>
                    <Text style={styles.contactText}>
                        If you have any questions about this Privacy Policy, please contact us at support@flybook.com.bd
                    </Text>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
    },
    scrollContent: {
        padding: 24,
    },
    introSection: {
        marginBottom: 32,
    },
    lastUpdated: {
        fontSize: 14,
        color: Colors.primary,
        fontWeight: '700',
        marginBottom: 8,
    },
    introText: {
        fontSize: 16,
        lineHeight: 24,
        color: Colors.text,
        fontWeight: '500',
    },
    section: {
        marginBottom: 28,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 12,
    },
    sectionContent: {
        fontSize: 15,
        lineHeight: 22,
        color: Colors.textSecondary,
    },
    contactSection: {
        marginTop: 16,
        padding: 20,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
    },
    contactTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 8,
    },
    contactText: {
        fontSize: 14,
        lineHeight: 20,
        color: Colors.textSecondary,
    },
});

export default PrivacyPolicyScreen;
