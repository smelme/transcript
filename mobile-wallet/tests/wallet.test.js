/**
 * Tests for Mobile Wallet
 * Coverage: Credential management, presentations, sharing, security
 */

import assert from 'assert';
import { test } from 'node:test';
import { MobileWallet } from '../src/index.js';

/**
 * Helper to create valid credential data
 */
function createValidCredential() {
  return {
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [
      { courseCode: 'CS101', courseName: 'Introduction to CS', credits: 3, grade: 'A' }
    ],
    gpa: 3.8
  };
}

test('Wallet - Create Instance', () => {
  const wallet = new MobileWallet();
  assert(wallet);
  assert(wallet.walletId);
});

test('Wallet - Setup Wallet', () => {
  const wallet = new MobileWallet();
  const result = wallet.setupWallet('user-001', '1234');

  assert.strictEqual(result.success, true);
  assert.strictEqual(wallet.userId, 'user-001');
});

test('Wallet - Reject Weak PIN', () => {
  const wallet = new MobileWallet();
  const result = wallet.setupWallet('user-001', '12');

  assert.strictEqual(result.success, false);
});

test('Wallet - Authenticate Success', () => {
  const wallet = new MobileWallet();
  wallet.setupWallet('user-001', '1234');

  const result = wallet.authenticate('1234');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.authenticated, true);
});

test('Wallet - Authenticate Failure', () => {
  const wallet = new MobileWallet();
  wallet.setupWallet('user-001', '1234');

  const result = wallet.authenticate('5678');
  assert.strictEqual(result.success, false);
});

test('Wallet - Lock Wallet', () => {
  const wallet = new MobileWallet();
  wallet.setupWallet('user-001', '1234');

  const result = wallet.lockWallet();
  assert.strictEqual(result.success, true);
  assert.strictEqual(wallet.locked, true);
});

test('Wallet - Add Credential', () => {
  const wallet = new MobileWallet();
  const cred = createValidCredential();

  const result = wallet.addCredential('cred-001', cred, {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.credentialId, 'cred-001');
});

test('Wallet - Reject Duplicate Credential', () => {
  const wallet = new MobileWallet();
  const cred = createValidCredential();

  wallet.addCredential('cred-001', cred, { issuer: 'University', type: 'AcademicCredential' });
  const result2 = wallet.addCredential('cred-001', cred, { issuer: 'University', type: 'AcademicCredential' });

  assert.strictEqual(result2.success, false);
});

test('Wallet - Get Credential', () => {
  const wallet = new MobileWallet();
  const cred = createValidCredential();
  wallet.addCredential('cred-001', cred, { issuer: 'University', type: 'AcademicCredential' });

  const retrieved = wallet.getCredential('cred-001');
  assert(retrieved);
  assert.strictEqual(retrieved.id, 'cred-001');
  assert.strictEqual(retrieved.metadata.type, 'AcademicCredential');
});

test('Wallet - Get Non-Existent Credential', () => {
  const wallet = new MobileWallet();
  const retrieved = wallet.getCredential('nonexistent');

  assert.strictEqual(retrieved, null);
});

test('Wallet - List Credentials', () => {
  const wallet = new MobileWallet();

  for (let i = 1; i <= 3; i++) {
    wallet.addCredential(`cred-00${i}`, createValidCredential(), {
      issuer: 'University',
      type: 'AcademicCredential'
    });
  }

  const list = wallet.listCredentials();
  assert.strictEqual(list.length, 3);
});

test('Wallet - Filter Credentials by Type', () => {
  const wallet = new MobileWallet();

  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });
  wallet.addCredential('cred-002', createValidCredential(), {
    issuer: 'Company',
    type: 'EmploymentCredential'
  });

  const academic = wallet.listCredentials({ type: 'AcademicCredential' });
  assert.strictEqual(academic.length, 1);
});

test('Wallet - Delete Credential', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const result = wallet.deleteCredential('cred-001');
  assert.strictEqual(result.success, true);
  assert.strictEqual(wallet.getCredential('cred-001'), null);
});

test('Wallet - Pin Credential', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const result = wallet.pinCredential('cred-001');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.pinned, true);
});

test('Wallet - Unpin Credential', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  wallet.pinCredential('cred-001');
  const result = wallet.unpinCredential('cred-001');
  assert.strictEqual(result.pinned, false);
});

test('Wallet - List Pinned Credentials', () => {
  const wallet = new MobileWallet();

  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });
  wallet.addCredential('cred-002', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  wallet.pinCredential('cred-001');

  const pinned = wallet.listCredentials({ pinned: true });
  assert.strictEqual(pinned.length, 1);
});

test('Wallet - Initiate Presentation', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const result = wallet.initiatePresentation('cred-001', 'verifier-001');
  assert.strictEqual(result.success, true);
  assert(result.presentationId);
});

test('Wallet - Approve Presentation', () => {
  const wallet = new MobileWallet();
  wallet.setupWallet('user-001', '1234');
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const pres = wallet.initiatePresentation('cred-001', 'verifier-001');
  const result = wallet.approvePresentation(pres.presentationId, '1234');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'approved');
});

test('Wallet - Reject Presentation', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const pres = wallet.initiatePresentation('cred-001', 'verifier-001');
  const result = wallet.rejectPresentation(pres.presentationId);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'rejected');
});

test('Wallet - Get Presentation Status', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const pres = wallet.initiatePresentation('cred-001', 'verifier-001');
  const status = wallet.getPresentationStatus(pres.presentationId);

  assert(status);
  assert.strictEqual(status.status, 'initiated');
});

test('Wallet - Presentation History', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  for (let i = 1; i <= 3; i++) {
    wallet.initiatePresentation('cred-001', `verifier-00${i}`);
  }

  const history = wallet.getPresentationHistory();
  assert.strictEqual(history.length, 3);
});

test('Wallet - Share Credential', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const result = wallet.shareCredential('cred-001', 'qr');
  assert.strictEqual(result.success, true);
  assert(result.sessionId);
});

test('Wallet - Get Statistics', () => {
  const wallet = new MobileWallet();
  wallet.setupWallet('user-001', '1234');

  for (let i = 1; i <= 2; i++) {
    wallet.addCredential(`cred-00${i}`, createValidCredential(), {
      issuer: 'University',
      type: 'AcademicCredential'
    });
  }

  const stats = wallet.getStatistics();
  assert.strictEqual(stats.totalCredentials, 2);
  assert.strictEqual(stats.userId, 'user-001');
});

test('Wallet - Export Backup', () => {
  const wallet = new MobileWallet();
  wallet.setupWallet('user-001', '1234');
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const result = wallet.exportBackup();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.backup.credentialCount, 1);
});

test('Wallet - Import Backup', () => {
  const wallet1 = new MobileWallet();
  wallet1.setupWallet('user-001', '1234');
  wallet1.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const backup = wallet1.exportBackup();

  const wallet2 = new MobileWallet();
  const result = wallet2.importBackup(backup.backup);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.imported, 1);
});

test('Wallet - Clear Wallet', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  assert.strictEqual(wallet.listCredentials().length, 1);

  const result = wallet.clearWallet();
  assert.strictEqual(result.success, true);
  assert.strictEqual(wallet.listCredentials().length, 0);
});

test('Wallet - Audit Log', () => {
  const wallet = new MobileWallet();
  wallet.setupWallet('user-001', '1234');
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const log = wallet.getAuditLog();
  assert(log.length > 0);
});

test('Wallet - Auto Lock Check', () => {
  const wallet = new MobileWallet({ autoLock: 1 }); // 1ms for testing
  wallet.setupWallet('user-001', '1234');

  // Wait for auto-lock
  setTimeout(() => {
    const result = wallet.checkAutoLock();
    assert.strictEqual(result.autoLocked, true);
  }, 10);
});

test('Wallet - Storage Management', () => {
  const wallet = new MobileWallet({ maxStorage: 1000 }); // 1KB limit
  const cred = createValidCredential();

  const result1 = wallet.addCredential('cred-001', cred, {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  assert.strictEqual(result1.success, true);

  const stats = wallet.getStatistics();
  assert(stats.storageUsed > 0);
});

test('Wallet - Selective Disclosure', () => {
  const wallet = new MobileWallet();
  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });

  const result = wallet.initiatePresentation(
    'cred-001',
    'verifier-001',
    ['studentId', 'institution'] // Only these claims
  );

  assert.strictEqual(result.success, true);
});

test('Wallet - Multiple Issuers', () => {
  const wallet = new MobileWallet();

  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University A',
    type: 'AcademicCredential'
  });
  wallet.addCredential('cred-002', createValidCredential(), {
    issuer: 'University B',
    type: 'AcademicCredential'
  });

  const stats = wallet.getStatistics();
  assert.strictEqual(Object.keys(stats.issuers).length, 2);
});

test('Wallet - Credential Types Breakdown', () => {
  const wallet = new MobileWallet();

  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University',
    type: 'AcademicCredential'
  });
  wallet.addCredential('cred-002', createValidCredential(), {
    issuer: 'Company',
    type: 'EmploymentCredential'
  });

  const stats = wallet.getStatistics();
  assert(stats.credentialTypes['AcademicCredential']);
  assert(stats.credentialTypes['EmploymentCredential']);
});

test('Wallet - Filter by Issuer', () => {
  const wallet = new MobileWallet();

  wallet.addCredential('cred-001', createValidCredential(), {
    issuer: 'University A',
    type: 'AcademicCredential'
  });
  wallet.addCredential('cred-002', createValidCredential(), {
    issuer: 'University B',
    type: 'AcademicCredential'
  });

  const filtered = wallet.listCredentials({ issuer: 'University A' });
  assert.strictEqual(filtered.length, 1);
});
