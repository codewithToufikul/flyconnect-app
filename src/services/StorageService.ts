import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  INBOX: 'flyconnect_inbox',
  MESSAGES_PREFIX: 'flyconnect_msg_',
  QUEUED_MESSAGES: 'flyconnect_queued_msgs',
  RECENT_SEARCHES: 'flyconnect_recent_searches',
};

class StorageService {
  // ── Inbox (Conversation List) ───────────────────────────────────────────

  static async saveInbox(conversations: any[]) {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.INBOX,
        JSON.stringify(conversations),
      );
    } catch (error) {
      console.error('StorageService: Error saving inbox', error);
    }
  }

  static async getInbox(): Promise<any[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.INBOX);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('StorageService: Error getting inbox', error);
      return [];
    }
  }

  // ── Messages (Per Chat) ──────────────────────────────────────────────────

  static async saveMessages(conversationId: string, messages: any[]) {
    try {
      // Only keep top 50 for storage efficiency
      const toSave = messages.slice(0, 50);
      await AsyncStorage.setItem(
        `${STORAGE_KEYS.MESSAGES_PREFIX}${conversationId}`,
        JSON.stringify(toSave),
      );
    } catch (error) {
      console.error('StorageService: Error saving messages', error);
    }
  }

  static async getMessages(conversationId: string): Promise<any[]> {
    try {
      const data = await AsyncStorage.getItem(
        `${STORAGE_KEYS.MESSAGES_PREFIX}${conversationId}`,
      );
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('StorageService: Error getting messages', error);
      return [];
    }
  }

  // ── Merging Logic ────────────────────────────────────────────────────────

  /**
   * Merges freshly fetched messages with cached ones, keeping the UI smooth.
   */
  static mergeMessages(cached: any[], fetched: any[]) {
    const messageMap = new Map();

    // Use temp-IDs or real server IDs as keys
    cached.forEach(m => messageMap.set(m._id, m));
    fetched.forEach(m => messageMap.set(m._id, m));

    // Sort by createdAt descending
    return Array.from(messageMap.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  // ── Clear Cache ──────────────────────────────────────────────────────────

  static async clearAll() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const flyConnectKeys = keys.filter(k => k.startsWith('flyconnect_'));
      await AsyncStorage.multiRemove(flyConnectKeys);
    } catch (error) {
      console.error('StorageService: Error clearing cache', error);
    }
  }

  // ── Recent Searches ───────────────────────────────────────────────────────

  static async saveRecentSearch(user: any) {
    try {
      if (!user) return;
      
      const current = await this.getRecentSearches();
      const userId = user._id || user.id;
      
      // Remove if already exists (to move to top)
      const filtered = current.filter((u: any) => (u._id || u.id) !== userId);
      
      // Add to front and limit to 5
      const updated = [user, ...filtered].slice(0, 5);
      
      await AsyncStorage.setItem(
        STORAGE_KEYS.RECENT_SEARCHES,
        JSON.stringify(updated),
      );
    } catch (error) {
      console.error('StorageService: Error saving recent search', error);
    }
  }

  static async getRecentSearches(): Promise<any[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('StorageService: Error getting recent searches', error);
      return [];
    }
  }
}

export default StorageService;
