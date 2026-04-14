import RNCallKeep from 'react-native-callkeep';
import {Platform} from 'react-native';

const options = {
  ios: {
    appName: 'FlyConnect',
  },
  android: {
    alertTitle: 'Permissions required',
    alertDescription: 'This application needs to access your phone accounts',
    cancelButton: 'Cancel',
    okButton: 'ok',
    imageName: 'phone_account_icon',
    additionalPermissions: [],
    selfManaged: true, // true allows custom UI for incoming calls (Messenger style)
  },
};

class CallKeepService {
  private isInitialized = false;

  async setup(callbacks: {
    onAnswerCall: (data: any) => void;
    onEndCall: (data: any) => void;
    onActivateAudioSession?: () => void;
    onMuteCall?: (data: any) => void;
    onToggleAudioRoute?: (data: any) => void;
    onShowIncomingCallUi?: (data: any) => void;
  }) {
    if (this.isInitialized) return;

    try {
      await RNCallKeep.setup(options);
      RNCallKeep.setAvailable(true);

      // CallKeep Listeners
      RNCallKeep.addEventListener('answerCall', callbacks.onAnswerCall);
      RNCallKeep.addEventListener('endCall', callbacks.onEndCall);
      if (callbacks.onActivateAudioSession) {
        RNCallKeep.addEventListener(
          'didActivateAudioSession',
          callbacks.onActivateAudioSession,
        );
      }
      if (callbacks.onMuteCall) {
        RNCallKeep.addEventListener(
          'didPerformSetMutedCallAction',
          callbacks.onMuteCall,
        );
      }
      if (callbacks.onToggleAudioRoute) {
        RNCallKeep.addEventListener(
          'didChangeAudioRoute',
          callbacks.onToggleAudioRoute,
        );
      }
      if (Platform.OS === 'android' && callbacks.onShowIncomingCallUi) {
        RNCallKeep.addEventListener(
          'showIncomingCallUi',
          callbacks.onShowIncomingCallUi,
        );
      }

      if (Platform.OS === 'android') {
        await RNCallKeep.registerPhoneAccount(options);
        RNCallKeep.registerAndroidEvents();
      }

      this.isInitialized = true;
      console.log('✅ [CallKeepService] Initialized successfully');
    } catch (err) {
      console.error('❌ [CallKeepService] Setup failed:', err);
    }
  }

  displayIncomingCall(
    uuid: string,
    handle: string,
    localizedCallerName: string,
  ) {
    if (!uuid) return;
    const safeHandle = handle || 'Unknown';
    const safeName = localizedCallerName || 'Unknown Caller';
    console.log(`📞 [CallKeep] Displaying Incoming: ${uuid} for ${safeName}`);

    try {
      RNCallKeep.displayIncomingCall(
        uuid,
        safeHandle,
        safeName,
        'number',
        false,
      );
    } catch (e) {
      console.error('❌ [CallKeep] Display Incoming Failed:', e);
    }
  }

  startCall(uuid: string, handle: string, contactIdentifier: string) {
    if (!uuid) return;
    const safeHandle = handle || 'Unknown';
    const safeName = contactIdentifier || 'Unknown';
    console.log(`🚀 [CallKeep] Starting Call: ${uuid} for ${safeName}`);

    try {
      RNCallKeep.startCall(uuid, safeHandle, safeName);
    } catch (e) {
      console.error('❌ [CallKeep] Start Call Failed:', e);
    }
  }

  endCall(uuid: string) {
    console.log('🛑 [CallKeep] Ending Call:', uuid);
    try {
      RNCallKeep.endAllCalls();
    } catch (e) {
      console.error('❌ [CallKeep] End Call Failed:', e);
    }
  }

  backToForeground() {
    RNCallKeep.backToForeground();
  }

  setMutedCall(uuid: string, muted: boolean) {
    RNCallKeep.setMutedCall(uuid, muted);
  }

  setOnHold(uuid: string, hold: boolean) {
    RNCallKeep.setOnHold(uuid, hold);
  }

  updateDisplay(uuid: string, displayName: string, handle: string) {
    RNCallKeep.updateDisplay(uuid, displayName, handle);
  }
}

export default new CallKeepService();
