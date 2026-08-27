#!/usr/bin/env node

/**
 * Credential Schema Validator CLI
 * Validates credential data against mDoc Academic Schema
 */

import { readFileSync } from 'fs';
import { validator } from '../index.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('📋 mDoc Schema Validator\n');
  console.log('Usage: node src/cli/validate-credential.js <json-file-path>\n');
  console.log('Example:');
  console.log('  node src/cli/validate-credential.js ./sample-credential.json\n');
  process.exit(1);
}

const filePath = args[0];

try {
  const jsonContent = readFileSync(filePath, 'utf-8');
  const credential = JSON.parse(jsonContent);

  console.log('📋 Validating Credential Against mDoc Academic Schema\n');
  console.log(`File: ${filePath}\n`);

  const result = validator.validateCompletely(credential);

  if (result.valid) {
    console.log('✅ VALID - Credential meets all schema requirements\n');
    console.log('Credential Summary:');
    console.log(`  Student: ${credential.name.givenName} ${credential.name.familyName}`);
    console.log(`  Institution: ${credential.institution.name}`);
    console.log(`  Degree: ${credential.degreeLevel || 'N/A'}`);
    console.log(`  GPA: ${credential.gpa || 'N/A'}`);
    console.log(`  Courses: ${credential.courses.length}`);
    console.log(`  Issue Date: ${credential.issueDate}`);
    console.log(`  Expiry Date: ${credential.expiryDate}\n`);
    process.exit(0);
  } else {
    console.log('❌ INVALID - Credential has validation errors\n');
    console.log('Errors:');
    result.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. [${error.path}] ${error.message}`);
      if (error.params) {
        console.log(`     Details: ${JSON.stringify(error.params)}`);
      }
    });
    console.log();
    process.exit(1);
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`❌ File not found: ${filePath}`);
  } else if (error instanceof SyntaxError) {
    console.error(`❌ Invalid JSON: ${error.message}`);
  } else {
    console.error(`❌ Error: ${error.message}`);
  }
  process.exit(1);
}
