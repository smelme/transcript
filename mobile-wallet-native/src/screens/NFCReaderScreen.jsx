import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { shareCredentialViaNFC } from '../services/nfcService';

function NFCReaderScreen() {
  const [nfcSupported, setNfcSupported] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [lastShared, setLastShared] = useState(null);

  useEffect(() => {
    checkNFCSupport();
  }, []);

  const checkNFCSupport = async () => {
    try {
      const supported = await isNFCSupported();
      setNfcSupported(supported);
      if (!supported) {
        Alert.alert('NFC Not Available', 'This device does not support NFC');
      }
    } catch (error) {
      console.error('Error checking NFC support:', error);
      setNfcSupported(false);
    }
  };

  const isNFCSupported = async () => {
    // Placeholder for NFC support check
    return true;
  };

  const handleShareCredential = async () => {
    if (!nfcSupported) {
      Alert.alert('Error', 'NFC is not supported on this device');
      return;
    }

    setSharing(true);
    try {
      const result = await shareCredentialViaNFC({
        credentialId: 'cred-001',
        issuerId: 'issuer-001',
        timestamp: new Date().toISOString()
      });

      setLastShared(result);
      Alert.alert('Success', 'Credential shared via NFC');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to share credential');
    } finally {
      setSharing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Share via NFC</Text>
        <Text style={styles.subtitle}>
          {nfcSupported ? 'NFC is supported' : 'NFC not available'}
        </Text>
      </View>

      <View style={styles.content}>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Tap this device to another device to share your credential. The recipient's device must have NFC enabled and a compatible wallet app installed.
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.button, !nfcSupported && styles.buttonDisabled]}
          onPress={handleShareCredential}
          disabled={!nfcSupported || sharing}
        >
          <Text style={styles.buttonText}>
            {sharing ? 'Sharing...' : 'Start NFC Sharing'}
          </Text>
        </TouchableOpacity>

        {lastShared && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Last Shared:</Text>
            <Text style={styles.resultText}>
              Credential ID: {lastShared.credentialId}
            </Text>
            <Text style={styles.resultText}>
              Issuer ID: {lastShared.issuerId}
            </Text>
            <Text style={styles.resultText}>
              Time: {new Date(lastShared.timestamp).toLocaleTimeString()}
            </Text>
          </View>
        )}
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
    color: '#fff',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: '#aaa'
  },
  content: {
    flex: 1,
    padding: 16
  },
  infoBox: {
    backgroundColor: '#e7f3ff',
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
    padding: 12,
    borderRadius: 6,
    marginBottom: 24
  },
  infoText: {
    fontSize: 14,
    color: '#003d82',
    lineHeight: 20
  },
  button: {
    backgroundColor: '#28a745',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24
  },
  buttonDisabled: {
    backgroundColor: '#ccc'
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  resultBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  resultText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'monospace'
  }
});

export default NFCReaderScreen;
