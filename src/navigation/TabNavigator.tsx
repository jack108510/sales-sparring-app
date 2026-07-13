import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { TabParamList } from '../types';
import HomeScreen from '../screens/HomeScreen';
import DrillScreen from '../screens/DrillScreen';
import VaultScreen from '../screens/VaultScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{icon}</Text>;
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#12121f',
          borderTopColor: '#1e1e2e',
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
        },
        tabBarActiveTintColor: '#6c63ff',
        tabBarInactiveTintColor: '#444',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
      }}
    >
      <Tab.Screen
        name="Spar"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🥊" focused={focused} /> }}
      />
      <Tab.Screen
        name="Drill"
        component={DrillScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⚡" focused={focused} /> }}
      />
      <Tab.Screen
        name="Vault"
        component={VaultScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📼" focused={focused} /> }}
      />
      <Tab.Screen
        name="You"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}
