import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView } from 'react-native';

function CredentialDetailScreen({ route }) {
  const { credential } = route.params;

  const getStatusColor = (expiresAt) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const daysLeft = Math.floor((expires - now) / (1000 * 60 * 60 * 24));
    
    if (daysLeft < 0) return '#dc3545';
    if (daysLeft < 30) return '#ffc107';
    return '#28a745';
  };

  const getStatusText = (expiresAt) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const daysLeft = Math.floor((expires - now) / (1000 * 60 * 60 * 24));
    
    if (daysLeft < 0) return 'Expired';
    if (daysLeft < 30) return `Expires in ${daysLeft} days`;
    return 'Valid';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(credential.expiresAt) }]}>
          <Text style={styles.statusText}>{getStatusText(credential.expiresAt)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credential Information</Text>
          
          <DetailRow label="Type" value={credential.credentialType} />
          <DetailRow label="Credential ID" value={credential.credentialId} monospace />
          <DetailRow label="Issuer" value={credential.issuer || 'Unknown'} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subject Details</Text>
          
          {credential.studentId && (
            <DetailRow label="Student ID" value={credential.studentId} monospace />
          )}
          {credential.employeeId && (
            <DetailRow label="Employee ID" value={credential.employeeId} monospace />
          )}
          {credential.institution && (
            <DetailRow label="Institution" value={credential.institution} />
          )}
          {credential.employer && (
            <DetailRow label="Employer" value={credential.employer} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dates</Text>
          
          <DetailRow 
            label="Issued" 
            value={new Date(credential.issuedAt).toLocaleDateString() + ' ' + new Date(credential.issuedAt).toLocaleTimeString()} 
          />
          <DetailRow 
            label="Expires" 
            value={new Date(credential.expiresAt).toLocaleDateString() + ' ' + new Date(credential.expiresAt).toLocaleTimeString()} 
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>Share via NFC</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]}>
            <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>Delete Credential</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, monospace = false }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, monospace && styles.monospace]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  content: {
    flex: 1,
    padding: 16
  },
  statusBadge: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center'
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 16,
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
  detailRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    maxWidth: '35%'
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
    maxWidth: '65%',
    textAlign: 'right'
  },
  monospace: {
    fontFamily: 'monospace',
    fontSize: 11
  },
  actionButton: {
    backgroundColor: '#007bff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 6,
    alignItems: 'center'
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#dc3545'
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  secondaryButtonText: {
    color: '#dc3545'
  }
});

export default CredentialDetailScreen;
