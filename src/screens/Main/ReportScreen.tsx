import React, { useState } from 'react';
import {
    StyleSheet,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    SafeAreaView,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
    Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../../theme/theme';

const ReportScreen = ({ route }: any) => {
    const navigation = useNavigation();
    const { user } = route.params || {};
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const reportReasons = [
        'Spam',
        'Harassment',
        'Inappropriate Content',
        'Suspicious Activity',
        'Other',
    ];
    const [selectedReason, setSelectedReason] = useState<string | null>(null);

    const handleSubmit = () => {
        if (!selectedReason) {
            Alert.alert('Selection Required', 'Please select a reason for the report.');
            return;
        }

        setIsSubmitting(true);
        
        // Simulate API call
        setTimeout(() => {
            setIsSubmitting(false);
            Alert.alert(
                'Report Submitted',
                'Your report is under review. Thank you for helping us keep FlyConnect safe.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        }, 1500);
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            
            <View style={styles.header}>
                <TouchableOpacity 
                    style={styles.backButton} 
                    onPress={() => navigation.goBack()}
                >
                    <Icon name="chevron-back" size={28} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Report {user?.name || 'User'}</Text>
                <View style={{ width: 40 }} />
            </View>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.content}>
                        <Text style={styles.instructionText}>
                            Why are you reporting this user? Your report is anonymous.
                        </Text>

                        <View style={styles.reasonsContainer}>
                            {reportReasons.map((item) => (
                                <TouchableOpacity 
                                    key={item}
                                    style={[
                                        styles.reasonItem,
                                        selectedReason === item && styles.reasonItemSelected
                                    ]}
                                    onPress={() => setSelectedReason(item)}
                                >
                                    <View style={[
                                        styles.radioButton,
                                        selectedReason === item && styles.radioButtonSelected
                                    ]}>
                                        {selectedReason === item && <View style={styles.radioInner} />}
                                    </View>
                                    <Text style={[
                                        styles.reasonText,
                                        selectedReason === item && styles.reasonTextSelected
                                    ]}>{item}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.label}>Additional Details (Optional)</Text>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Tell us more about the issue..."
                            placeholderTextColor={Colors.textSecondary}
                            multiline
                            numberOfLines={4}
                            value={reason}
                            onChangeText={setReason}
                            textAlignVertical="top"
                        />

                        <TouchableOpacity 
                            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
                            onPress={handleSubmit}
                            disabled={isSubmitting}
                        >
                            <Text style={styles.submitButtonText}>
                                {isSubmitting ? 'Submitting...' : 'Submit Report'}
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
        </SafeAreaView>
    );
};

// Import ScrollView at the top
import { ScrollView } from 'react-native-gesture-handler';

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
    content: {
        padding: 24,
    },
    instructionText: {
        fontSize: 15,
        color: Colors.textSecondary,
        lineHeight: 22,
        marginBottom: 24,
    },
    reasonsContainer: {
        marginBottom: 32,
    },
    reasonItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    reasonItemSelected: {
        borderColor: Colors.primary,
        backgroundColor: '#EEF2FF',
    },
    radioButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    radioButtonSelected: {
        borderColor: Colors.primary,
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.primary,
    },
    reasonText: {
        fontSize: 16,
        color: Colors.text,
        fontWeight: '500',
    },
    reasonTextSelected: {
        color: Colors.primary,
        fontWeight: '700',
    },
    label: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 12,
    },
    textInput: {
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        padding: 16,
        color: Colors.text,
        fontSize: 16,
        minHeight: 120,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        marginBottom: 32,
    },
    submitButton: {
        height: 56,
        backgroundColor: '#EF4444',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
});

export default ReportScreen;
