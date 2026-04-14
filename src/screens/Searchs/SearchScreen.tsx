import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    FlatList,
    TouchableOpacity,
    Image,
    ActivityIndicator,
    StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { searchUsers } from '../../services/api';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import StorageService from '../../services/StorageService';
import { useProfile } from '../../context/ProfileContext';
import { Colors } from '../../theme/theme';

const SearchScreen = ({ navigation }: any) => {
    const { user: currentUser } = useProfile();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [recentSearches, setRecentSearches] = useState<any[]>([]);
    const [suggestedFriends, setSuggestedFriends] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const loadInitialData = async () => {
            const [recent, inbox] = await Promise.all([
                StorageService.getRecentSearches(),
                StorageService.getInbox()
            ]);
            setRecentSearches(recent);
            
            // Extract friends from inbox participants (limit 5)
            if (inbox && currentUser) {
                const myId = currentUser.id || (currentUser as any)._id;
                const friends = inbox
                    .map((conv: any) => conv.participants.find((p: any) => (p._id || p.id) !== myId))
                    .filter(Boolean)
                    .slice(0, 5);
                setSuggestedFriends(friends);
            }
        };
        loadInitialData();
    }, [currentUser]);

    const handleSearch = useCallback(async (text: string) => {
        setQuery(text);
        if (text.trim().length > 0) {
            setLoading(true);
            try {
                const response = await searchUsers(text);
                if (response.success) {
                    setResults(response.data);
                }
            } catch (error) {
                console.error('Search Error:', error);
            } finally {
                setLoading(false);
            }
        } else {
            setResults([]);
        }
    }, []);

    const onSelectUser = async (user: any) => {
        await StorageService.saveRecentSearch(user);
        navigation.navigate('ChatScreen', { user });
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.userCard}
            onPress={() => onSelectUser(item)}
        >
            <View style={styles.userInfo}>
                <Image
                    source={{ uri: item.profileImage }}
                    style={styles.avatar}
                />
                <View style={styles.userTextContainer}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userHandle}>@{item.userName || item.number?.slice(-4)}</Text>
                </View>
            </View>
            <View style={styles.actionContainer}>
                {item.verificationStatus && (
                    <Icon name="checkmark-circle" size={20} color="#6366F1" style={styles.verifiedIcon} />
                )}
                <Icon name="chevron-forward" size={20} color="#9CA3AF" />
            </View>
        </TouchableOpacity>
    );

    const renderRecentItem = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.recentItem} onPress={() => onSelectUser(item)}>
            <Image source={{ uri: item.profileImage }} style={styles.recentAvatar} />
            <Text style={styles.recentName} numberOfLines={1}>{item.name.split(' ')[0]}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Find Connections</Text>
                <View style={styles.searchBarContainer}>
                    <Icon name="search" size={20} color="#6B7280" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by name, username..."
                        placeholderTextColor="#9CA3AF"
                        value={query}
                        onChangeText={handleSearch}
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => handleSearch('')}>
                            <Icon name="close-circle" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#6366F1" />
                </View>
            ) : query.trim().length > 0 ? (
                results.length > 0 ? (
                    <FlatList
                        data={results}
                        keyExtractor={(item) => item._id || item.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.listContainer}
                        showsVerticalScrollIndicator={false}
                    />
                ) : (
                    <View style={styles.centerContainer}>
                        <Icon name="people-outline" size={80} color="#E5E7EB" />
                        <Text style={styles.emptyText}>No users found for "{query}"</Text>
                    </View>
                )
            ) : (
                <FlatList
                    ListHeaderComponent={
                        <View>
                            {recentSearches.length > 0 && (
                                <View style={styles.section}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionTitle}>Recent Searches</Text>
                                        <TouchableOpacity onPress={() => { setRecentSearches([]); StorageService.saveRecentSearch(null); }}>
                                            <Text style={styles.clearAll}>Clear</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <FlatList
                                        horizontal
                                        data={recentSearches}
                                        renderItem={renderRecentItem}
                                        keyExtractor={(item) => `recent-${item._id || item.id}`}
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.recentList}
                                    />
                                </View>
                            )}
                            
                            {suggestedFriends.length > 0 && (
                                <Text style={[styles.sectionTitle, { marginLeft: 20, marginTop: 10, marginBottom: 10 }]}>Suggested Friends</Text>
                            )}
                        </View>
                    }
                    data={suggestedFriends}
                    keyExtractor={(item) => `friend-${item._id || item.id}`}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 20,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: '#111827',
        marginBottom: 15,
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 15,
        paddingHorizontal: 15,
        height: 50,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#111827',
        fontWeight: '500',
    },
    listContainer: {
        padding: 20,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 15,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 55,
        height: 55,
        borderRadius: 27.5,
        backgroundColor: '#E5E7EB',
    },
    userTextContainer: {
        marginLeft: 15,
    },
    userName: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1F2937',
    },
    userHandle: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    actionContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    verifiedIcon: {
        marginRight: 8,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        marginTop: 60,
    },
    emptyText: {
        marginTop: 20,
        fontSize: 16,
        color: '#9CA3AF',
        textAlign: 'center',
        fontWeight: '500',
    },
    section: {
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#4B5563',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    clearAll: {
        fontSize: 13,
        color: '#6366F1',
        fontWeight: '600',
    },
    recentList: {
        paddingLeft: 20,
        paddingRight: 10,
    },
    recentItem: {
        alignItems: 'center',
        marginRight: 20,
        width: 65,
    },
    recentAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#F3F4F6',
        marginBottom: 8,
        borderWidth: 2,
        borderColor: '#EEEFFF',
    },
    recentName: {
        fontSize: 12,
        color: '#374151',
        fontWeight: '500',
        textAlign: 'center',
    },
});

export default SearchScreen;