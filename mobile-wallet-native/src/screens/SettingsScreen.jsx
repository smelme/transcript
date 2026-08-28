import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Switch, Alert } from 'react-native';

function SettingsScreen() {
  const [nfcEnabled, setNfcEnabled] = useState(true);
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [autoBackup, setAutoBackup] = useState(false);

  const handleClearCredentials = () => {
    Alert.alert(
      'Clear All Credentials',
      'Are you sure you want to delete all stored credentials? This action cannot be undone.',
      [
        { text: 'Cancel', onPress: () => {} },
        { 
          text: 'Clear', 
          onPress: () => {
            Alert.alert('Success', 'All credentials have been cleared');
          },
          style: 'destructive'
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          
          <View style={styles.setting}>
            <Text style={styles.settingLabel}>NFC Sharing</Text>
            <Switch 
              value={nfcEnabled} 
              onValueChange={setNfcEnabled}
              trackColor={{ false: '#ccc', true: '#28a745' }}
              thumbColor={nfcEnabled ? '#fff' : '#fff'}
            />
          </View>

          <View style={styles.setting}>
            <Text style={styles.settingLabel}>Biometric Lock</Text>
            <Switch 
              value={biometricEnabled} 
              onValueChange={setBiometricEnabled}
              trackColor={{ false: '#ccc', true: '#28a745' }}
              thumbColor={biometricEnabled ? '#fff' : '#fff'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          
          <View style={styles.setting}>
            <Text style={styles.settingLabel}>Auto Backup to Cloud</Text>
            <Switch 
              value={autoBackup} 
              onValueChange={setAutoBackup}
              trackColor={{ false: '#ccc', true: '#28a745' }}
              thumbColor={autoBackup ? '#fff' : '#fff'}
            />
          </View>

          <TouchableOpacity style={styles.settingButton}>
            <Text style={styles.settingButtonText}>Backup Now</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingButton}>
            <Text style={styles.settingButtonText}>Restore from Backup</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>0.1.0</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Wallet ID</Text>
            <Text style={styles.infoValue}>wallet-abc123...</Text>
          </View>
        </View>

        <View style={styles.dangerSection}>
          <TouchableOpacity 
            style={styles.dangerButton}
            onPress={handleClearCredentials}
          >
            <Text style={styles.dangerButtonText}>Clear All Credentials</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  header: {
    padding: 16,
    backgroundColor: '#343a40',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff'
  },
  content: {
    flex: 1,
    padding: 16
  },
  section: {
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  setting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  settingLabel: {
    fontSize: 14,
    color: '#333'
  },
  settingButton: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#f9f9f9'
  },
  settingButtonText: {
    fontSize: 14,
    color: '#007bff'
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  infoLabel: {
    fontSize: 14,
    color: '#666'
  },
  infoValue: {
    fontSize: 13,
    color: '#999',
    fontFamily: 'monospace'
  },
  dangerSection: {
    marginTop: 24
  },
  dangerButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  }
});

export default SettingsScreen;
