import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { getUserCache, saveUserCache, getProfileAPI, getToken } from '../services/api';

interface User {
    id: string;
    name: string;
    number: string;
    profileImage: string;
    userName?: string;
    role?: string;
    verificationStatus?: boolean;
}

interface ProfileContextType {
    user: User | null;
    loading: boolean;
    refreshProfile: () => Promise<void>;
    updateUserLocally: (userData: Partial<User>) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshProfile = useCallback(async () => {
        try {
            // 1. Try to load from cache immediately for fast UI response
            const cached = await getUserCache();
            if (cached) {
                // Use a functional update to check the current state without adding a dependency
                setUser(prev => (prev === null ? cached : prev));
                setLoading(false);
            }

            // 2. Fetch fresh data in the background (SWR pattern)
            const token = await getToken();
            if (token) {
                const response = await getProfileAPI();
                if (response.success && response.user) {
                    setUser(response.user);
                    await saveUserCache(response.user); // Update storage with fresh data
                }
            } else {
                setLoading(false);
            }
        } catch (error) {
            console.log('Profile refresh error:', error);
        } finally {
            setLoading(false);
        }
    }, []); // No more 'user' dependency

    const updateUserLocally = async (userData: Partial<User>) => {
        setUser(prev => {
           if (!prev) return prev;
           const updated = { ...prev, ...userData };
           saveUserCache(updated); // Background save
           return updated;
        });
    };

    useEffect(() => {
        refreshProfile();

        const sub = DeviceEventEmitter.addListener('AUTH_UPDATED', refreshProfile);
        return () => sub.remove();
    }, []); // Dependencies are now stable

    return (
        <ProfileContext.Provider value={{ user, loading, refreshProfile, updateUserLocally }}>
            {children}
        </ProfileContext.Provider>
    );
};

export const useProfile = () => {
    const context = useContext(ProfileContext);
    if (context === undefined) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }
    return context;
};
