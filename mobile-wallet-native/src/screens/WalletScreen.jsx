import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { getStoredCredentials } from '../services/walletService';

function WalletScreen({ navigation }) {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const stored = await getStoredCredentials();
      setCredentials(stored);
    } catch (error) {
      console.error('Error loading credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderCredential = ({ item }) => (
    <TouchableOpacity 
      style={styles.credentialCard}
      onPress={() => navigation.navigate('CredentialDetail', { credential: item })}
    >
      <Text style={styles.credentialType}>{item.credentialType}</Text>
      <Text style={styles.credentialId}>{item.credentialId}</Text>
      <Text style={styles.issuer}>{item.issuer || 'Unknown Issuer'}</Text>
      <Text style={styles.issuedDate}>
        Issued: {new Date(item.issuedAt).toLocaleDateString()}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Credentials</Text>
        <Text style={styles.count}>{credentials.length} credential(s)</Text>
      </View>
      
      {loading ? (
        <Text style={styles.loadingText}>Loading credentials...</Text>
      ) : credentials.length === 0 ? (
        <Text style={styles.emptyText}>No credentials stored yet</Text>
      ) : (
        <FlatList
          data={credentials}
          renderItem={renderCredential}
          keyExtractor={(item) => item.credentialId}
          contentContainerStyle={styles.listContent}
        />
      )}
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
  count: {
    fontSize: 14,
    color: '#aaa'
  },
  credentialCard: {
    margin: 8,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007bff',
    elevation: 2
  },
  credentialType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4
  },
  credentialId: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'monospace'
  },
  issuer: {
    fontSize: 13,
    color: '#555',
    marginBottom: 4
  },
  issuedDate: {
    fontSize: 12,
    color: '#888',
    marginTop: 8
  },
  listContent: {
    padding: 8
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginTop: 32
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#999',
    marginTop: 32
  }
});

export default WalletScreen;
