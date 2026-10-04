import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { PipModule } = NativeModules;
const pipEmitter = PipModule ? new NativeEventEmitter(PipModule) : null;

class PipService {
  private static instance: PipService;
  private isPipActive: boolean = false;

  public static getInstance(): PipService {
    if (!PipService.instance) {
      PipService.instance = new PipService();
    }
    return PipService.instance;
  }

  public async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'android' || !PipModule) return false;
    try {
      return await PipModule.isPipSupported();
    } catch {
      return false;
    }
  }

  public setAutoPip(enabled: boolean) {
    if (Platform.OS === 'android' && PipModule?.setAutoPipEnabled) {
      PipModule.setAutoPipEnabled(enabled);
    }
  }

  public async enterPip(width: number = 9, height: number = 16): Promise<boolean> {
    if (Platform.OS === 'android' && PipModule?.enterPip) {
      try {
        return await PipModule.enterPip(width, height);
      } catch (e) {
        console.warn('⚠️ [PipService] Enter PiP failed:', e);
        return false;
      }
    }
    return false;
  }

  public addPipListener(callback: (isInPip: boolean) => void) {
    if (!pipEmitter) return () => {};
    const subscription = pipEmitter.addListener('onPipModeChanged', (isInPip: boolean) => {
      this.isPipActive = isInPip;
      callback(isInPip);
    });
    return () => subscription.remove();
  }

  public getIsInPip(): boolean {
    return this.isPipActive;
  }
}

export default PipService.getInstance();
