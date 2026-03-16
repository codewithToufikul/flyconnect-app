import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import CallsScreen from '../../screens/Calls/CallsScreen';

const Stack = createStackNavigator();

const CallsStack = () => {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Calls" component={CallsScreen} />
        </Stack.Navigator>
    );
};

export default CallsStack;