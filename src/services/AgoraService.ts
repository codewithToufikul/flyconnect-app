import { createAgoraRtcEngine, IRtcEngine } from 'react-native-agora';

class AgoraService {
  private static instance: AgoraService;
  private engine: IRtcEngine | null = null;
  private currentChannel: string | null = null;
  private isJoined: boolean = false;
  private remoteUid: number | null = null;
  private connectedAt: number | null = null;

  public static getInstance(): AgoraService {
    if (!AgoraService.instance) {
      AgoraService.instance = new AgoraService();
    }
    return AgoraService.instance;
  }

  public getEngine(): IRtcEngine | null {
    return this.engine;
  }

  public getOrCreateEngine(): IRtcEngine {
    if (!this.engine) {
      this.engine = createAgoraRtcEngine();
    }
    return this.engine;
  }

  public setIsJoined(joined: boolean) {
    this.isJoined = joined;
  }

  public getIsJoined(): boolean {
    return this.isJoined;
  }

  public setRemoteUid(uid: number | null) {
    this.remoteUid = uid;
  }

  public getRemoteUid(): number | null {
    return this.remoteUid;
  }

  public setConnectedAt(time: number | null) {
    this.connectedAt = time;
  }

  public getConnectedAt(): number | null {
    return this.connectedAt;
  }

  public getElapsedDuration(): number {
    return this.connectedAt ? Math.max(0, Math.floor((Date.now() - this.connectedAt) / 1000)) : 0;
  }

  public setCurrentChannel(channel: string | null) {
    this.currentChannel = channel;
  }

  public getCurrentChannel(): string | null {
    return this.currentChannel;
  }

  public async leaveAndRelease(): Promise<void> {
    if (this.engine) {
      try {
        this.engine.stopEffect(1);
      } catch (_) {}
      try {
        this.engine.leaveChannel();
      } catch (_) {}
      try {
        this.engine.release();
      } catch (_) {}
      this.engine = null;
      this.isJoined = false;
      this.remoteUid = null;
      this.connectedAt = null;
      this.currentChannel = null;
      console.log('🧹 [AgoraService] Engine successfully left channel, reset duration and released.');
    } else {
      this.isJoined = false;
      this.remoteUid = null;
      this.connectedAt = null;
      this.currentChannel = null;
    }
  }
}

export default AgoraService.getInstance();

