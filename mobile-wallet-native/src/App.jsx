import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Screens
import WalletScreen from './screens/WalletScreen';
import ReceiveScreen from './screens/ReceiveScreen';
import StoreScreen from './screens/StoreScreen';
import SettingsScreen from './screens/SettingsScreen';
import NFCReaderScreen from './screens/NFCReaderScreen';
import CredentialDetailScreen from './screens/CredentialDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function WalletStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="WalletList" 
        component={WalletScreen}
        options={{ title: 'My Wallet' }}
      />
      <Stack.Screen 
        name="CredentialDetail" 
        component={CredentialDetailScreen}
        options={{ title: 'Credential Details' }}
      />
    </Stack.Navigator>
  );
}

function App() {
  const [walletId, setWalletId] = useState('wallet-' + Math.random().toString(36).substr(2, 9));
  const [credentials, setCredentials] = useState([]);

  useEffect(() => {
    // Initialize wallet with default credentials
    setCredentials([
      {
        id: 'cred-001',
        credentialType: 'AcademicCredential',
        studentId: 'STU-001',
        institution: 'State University',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'cred-002',
        credentialType: 'EmploymentCredential',
        employeeId: 'EMP-001',
        employer: 'Tech Company',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      }
    ]);
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen 
          name="Wallet" 
          component={WalletStack}
          options={{ 
            title: 'Wallet',
            headerShown: false 
          }}
        />
        <Tab.Screen 
          name="Receive" 
          component={ReceiveScreen}
          options={{ title: 'Receive Credential' }}
        />
        <Tab.Screen 
          name="Share" 
          component={NFCReaderScreen}
          options={{ title: 'Share (NFC)' }}
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default App;
