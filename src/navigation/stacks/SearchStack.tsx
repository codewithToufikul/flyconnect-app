import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import SearchScreen from '../../screens/Searchs/SearchScreen';

const Stack = createStackNavigator();

const SearchStack = () => {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Search" component={SearchScreen} />
        </Stack.Navigator>
    );
};

export default SearchStack;