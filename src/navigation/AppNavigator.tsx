import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import VoiceCallScreen from '../screens/VoiceCallScreen';
import CallResultsScreen from '../screens/CallResultsScreen';
import TabNavigator from './TabNavigator';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={TabNavigator} />
        <RootStack.Screen
          name="VoiceCall"
          component={VoiceCallScreen}
          options={{ presentation: 'modal' }}
        />
        <RootStack.Screen name="CallResults" component={CallResultsScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
