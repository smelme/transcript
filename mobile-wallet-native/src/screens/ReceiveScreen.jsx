import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, TextInput, Alert } from 'react-native';
import { receiveCredential } from '../services/walletService';

function ReceiveScreen() {
  const [qrData, setQrData] = useState('');
  const [receiving, setReceiving] = useState(false);

  const handleReceiveCredential = async () => {
    if (!qrData.trim()) {
      Alert.alert('Error', 'Please enter QR data or credential information');
      return;
    }

    setReceiving(true);
    try {
      let credentialData;
      try {
        credentialData = JSON.parse(qrData);
      } catch (e) {
        Alert.alert('Error', 'Invalid QR data format. Must be valid JSON.');
        setReceiving(false);
        return;
      }

      const result = await receiveCredential(credentialData);
      Alert.alert('Success', `Credential received and stored: ${result.credentialId}`);
      setQrData('');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to receive credential');
    } finally {
      setReceiving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Receive Credential</Text>
        <Text style={styles.subtitle}>Scan QR code or paste credential data</Text>
      </View>

      <View style={styles.content}>
        <TextInput
          style={styles.input}
          placeholder='Paste QR code data (JSON format) or use camera scanner'
          multiline
          numberOfLines={8}
          value={qrData}
          onChangeText={setQrData}
          editable={!receiving}
        />

        <TouchableOpacity 
          style={[styles.button, receiving && styles.buttonDisabled]}
          onPress={handleReceiveCredential}
          disabled={receiving}
        >
          <Text style={styles.buttonText}>
            {receiving ? 'Receiving...' : 'Receive Credential'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.info}>
          Enter the credential data in JSON format containing credentialId, issuerId, and other credential details.
        </Text>
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
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    fontFamily: 'monospace',
    textAlignVertical: 'top',
    marginBottom: 16
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16
  },
  buttonDisabled: {
    backgroundColor: '#ccc'
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  info: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    lineHeight: 18
  }
});

export default ReceiveScreen;
