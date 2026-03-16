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

const SearchScreen = ({ navigation }: any) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = useCallback(async (text: string) => {
        setQuery(text);
        if (text.length > 2) {
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

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.userCard}
            onPress={() => navigation.navigate('ChatScreen', { user: item })}
        >
            <View style={styles.userInfo}>
                <Image
                    source={{ uri: item.profileImage }}
                    style={styles.avatar}
                />
                <View style={styles.userTextContainer}>
                    <Text style={styles.userName}>{item.name}</Text>
                    <Text style={styles.userHandle}>@{item.userName || item.number}</Text>
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
            ) : results.length > 0 ? (
                <FlatList
                    data={results}
                    keyExtractor={(item) => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                />
            ) : query.length > 2 ? (
                <View style={styles.centerContainer}>
                    <Icon name="people-outline" size={80} color="#E5E7EB" />
                    <Text style={styles.emptyText}>No users found for "{query}"</Text>
                </View>
            ) : (
                <View style={styles.centerContainer}>
                    <Icon name="search-outline" size={80} color="#E5E7EB" />
                    <Text style={styles.emptyText}>Start typing to find new friends</Text>
                </View>
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
    },
    emptyText: {
        marginTop: 20,
        fontSize: 16,
        color: '#9CA3AF',
        textAlign: 'center',
        fontWeight: '500',
    },
});

export default SearchScreen;