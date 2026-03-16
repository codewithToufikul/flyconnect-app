import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getUserCache, saveUserCache, getProfileAPI } from '../services/api';

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
            if (cached && !user) {
                setUser(cached);
                setLoading(false); // Can show UI with cached data
            }

            // 2. Fetch fresh data in the background (SWR pattern)
            const response = await getProfileAPI();
            if (response.success && response.user) {
                setUser(response.user);
                await saveUserCache(response.user); // Update storage with fresh data
            }
        } catch (error) {
            console.log('Profile refresh error:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const updateUserLocally = async (userData: Partial<User>) => {
        if (user) {
            const updatedUser = { ...user, ...userData };
            setUser(updatedUser);
            await saveUserCache(updatedUser);
        }
    };

    useEffect(() => {
        refreshProfile();
    }, []);

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
