import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  Linking,
  StatusBar,
  DeviceEventEmitter,
  ActivityIndicator,
  AppState,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { check, request, PERMISSIONS, RESULTS, openSettings } from 'react-native-permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../theme/theme';

const PERMISSIONS_HANDLED_KEY = '@permissions_handled';

interface PermissionItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  permission: any;
  mandatory: boolean;
}

const PermissionScreen = ({ navigation }: any) => {
  const [permissionsState, setPermissionsState] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const requiredPermissions: PermissionItem[] = [
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Receive alerts for incoming calls and new messages.',
      icon: 'notifications-outline',
      permission: Platform.OS === 'android' ? (PERMISSIONS.ANDROID as any).POST_NOTIFICATIONS || 'android.permission.POST_NOTIFICATIONS' : null,
      mandatory: Platform.OS === 'android' && (Platform.Version as number) >= 33,
    },
    {
      id: 'mic',
      title: 'Microphone',
      description: 'Required for audio and video calls so others can hear you.',
      icon: 'mic-outline',
      permission: Platform.OS === 'android' ? PERMISSIONS.ANDROID.RECORD_AUDIO : PERMISSIONS.IOS.MICROPHONE,
      mandatory: true,
    },
    {
      id: 'camera',
      title: 'Camera',
      description: 'Required for video calls so others can see you.',
      icon: 'camera-outline',
      permission: Platform.OS === 'android' ? PERMISSIONS.ANDROID.CAMERA : PERMISSIONS.IOS.CAMERA,
      mandatory: true,
    },
    {
      id: 'phone',
      title: 'Phone',
      description: 'Required to manage calls and integrate with system calling.',
      icon: 'call-outline',
      permission: Platform.OS === 'android' ? (PERMISSIONS.ANDROID as any).READ_PHONE_NUMBERS || 'android.permission.READ_PHONE_NUMBERS' : null,
      mandatory: true,
    },
  ].filter(p => p.permission !== null && p.permission !== undefined);

  useEffect(() => {
    checkAllPermissions();

    // Refresh permissions when user returns from settings
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active') {
        checkAllPermissions();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const checkAllPermissions = async () => {
    try {
      const newState: Record<string, string> = {};
      for (const item of requiredPermissions) {
        try {
          let result = await check(item.permission);

          // Special case: for 'phone', check secondary permission if primary is denied
          if (item.id === 'phone' && result !== RESULTS.GRANTED && Platform.OS === 'android') {
            const secondary = await check('android.permission.READ_PHONE_NUMBERS' as any);
            if (secondary === RESULTS.GRANTED) result = RESULTS.GRANTED;
          }

          newState[item.id] = result;
        } catch (e) {
          newState[item.id] = RESULTS.DENIED;
        }
      }
      setPermissionsState(newState);
    } catch (e) {
      console.error('Permission check failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (item: PermissionItem) => {
    try {
      let result = await request(item.permission);
      console.log(`Permission request result for ${item.id}:`, result);

      // If primary phone permission is blocked, try the other one in the same group
      if (item.id === 'phone' && result === RESULTS.BLOCKED && Platform.OS === 'android') {
        console.log('Primary phone blocked, trying READ_PHONE_STATE...');
        result = await request(PERMISSIONS.ANDROID.READ_PHONE_STATE);
      }

      await checkAllPermissions();

      if (result === RESULTS.BLOCKED) {
        openSettings();
      }
    } catch (e) {
      console.error('Request permission failed:', e);
    }
  };

  const handleGrantAll = async () => {
    for (const item of requiredPermissions) {
      if (permissionsState[item.id] !== RESULTS.GRANTED) {
        await request(item.permission);
      }
    }
    await checkAllPermissions();
  };

  const handleContinue = async () => {
    console.log('PermissionScreen: handleContinue triggered');
    // Re-verify current state before proceeding
    const newState: Record<string, string> = {};
    for (const item of requiredPermissions) {
      let result = await check(item.permission);

      // Merge logic for phone
      if (item.id === 'phone' && result !== RESULTS.GRANTED && Platform.OS === 'android') {
        const secondary = await check('android.permission.READ_PHONE_NUMBERS' as any);
        if (secondary === RESULTS.GRANTED) result = RESULTS.GRANTED;
      }

      newState[item.id] = result;
    }

    const allSet = requiredPermissions
      .filter(p => p.mandatory)
      .every(p => {
        const status = newState[p.id];
        const isSet = status === RESULTS.GRANTED || status === RESULTS.LIMITED || status === RESULTS.UNAVAILABLE;
        if (!isSet) console.log(`Blocking permission: ${p.id} (Status: ${status})`);
        return isSet;
      });

    console.log('PermissionScreen: All mandatory permissions set?', allSet);

    if (allSet) {
      console.log('PermissionScreen: Proceeding to app...');
      await AsyncStorage.setItem(PERMISSIONS_HANDLED_KEY, 'true');
      DeviceEventEmitter.emit('PERMISSIONS_UPDATED');
    } else {
      setPermissionsState(newState);
      // Optional: Show a toast or alert here if something is still missing
    }
  };

  const isGranted = (status: string) => status === RESULTS.GRANTED || status === RESULTS.LIMITED;
  const isAvailable = (status: string) => status !== RESULTS.UNAVAILABLE;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.white }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const allMandatoryGranted = requiredPermissions
    .filter(p => p.mandatory)
    .every(p => {
      const status = permissionsState[p.id];
      return status === RESULTS.GRANTED || status === RESULTS.LIMITED || status === RESULTS.UNAVAILABLE;
    });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.white} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.refreshBadge}
            onPress={checkAllPermissions}
            activeOpacity={0.7}
          >
            <Icon name="refresh" size={16} color={Colors.primary} />
            <Text style={styles.refreshText}>Sync</Text>
          </TouchableOpacity>
          <View style={styles.iconContainer}>
            <Icon name="shield-checkmark" size={60} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Permissions Required</Text>
          <Text style={styles.subtitle}>
            To provide a seamless calling and messaging experience, FlyConnect needs the following permissions.
          </Text>
        </View>

        <View style={styles.permissionsList}>
          {requiredPermissions.map((item) => {
            const status = permissionsState[item.id];
            const granted = isGranted(status);
            const unavailable = status === RESULTS.UNAVAILABLE;

            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.permissionItem, unavailable && styles.unavailableItem]}
                onPress={() => !granted && !unavailable && handleRequest(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.permissionIcon, granted && styles.grantedIcon, unavailable && styles.unavailableIcon]}>
                  <Icon
                    name={unavailable ? 'ban-outline' : item.icon}
                    size={24}
                    color={granted || unavailable ? Colors.white : Colors.primary}
                  />
                </View>
                <View style={styles.permissionText}>
                  <Text style={styles.permissionTitle}>
                    {item.title} {unavailable && <Text style={styles.notNeeded}>(Not Needed)</Text>}
                  </Text>
                  <Text style={styles.permissionDescription}>
                    {unavailable ? `This permission is not required on your version of ${Platform.OS}.` : item.description}
                  </Text>
                </View>
                <View style={styles.statusIcon}>
                  {granted ? (
                    <Icon name="checkmark-circle" size={24} color="#22C55E" />
                  ) : unavailable ? (
                    <Icon name="remove-circle-outline" size={24} color={Colors.textSecondary} />
                  ) : (
                    <Icon name="chevron-forward" size={20} color={Colors.textSecondary} />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!allMandatoryGranted ? (
          <TouchableOpacity style={styles.grantAllButton} onPress={handleGrantAll}>
            <Text style={styles.grantAllText}>Grant All Permissions</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueText}>Continue to App</Text>
            <Icon name="arrow-forward" size={20} color={Colors.white} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        )}
        <Text style={styles.privacyNote}>
          We value your privacy. Your data is never shared with third parties.
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 10,
  },
  refreshBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 10,
    gap: 6,
  },
  refreshText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  permissionsList: {
    gap: 16,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  permissionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  grantedIcon: {
    backgroundColor: Colors.primary,
  },
  unavailableIcon: {
    backgroundColor: Colors.textSecondary,
  },
  unavailableItem: {
    opacity: 0.7,
    backgroundColor: '#F1F5F9',
  },
  notNeeded: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  permissionText: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  permissionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  statusIcon: {
    paddingLeft: 4,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  grantAllButton: {
    backgroundColor: Colors.primary + '15',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  grantAllText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: Colors.primary,
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  continueText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  privacyNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

export default PermissionScreen;
