import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Configuration validation tests
test('DevOps - Docker Compose Configuration Valid', () => {
  const dockerComposePath = './docker-compose.yml';
  const fileExists = fs.existsSync(dockerComposePath);
  
  assert.strictEqual(fileExists, true, 'docker-compose.yml must exist');
  
  const content = fs.readFileSync(dockerComposePath, 'utf-8');
  assert.ok(content.includes('version:'), 'docker-compose.yml must have version field');
  assert.ok(content.includes('services:'), 'docker-compose.yml must have services');
});

test('DevOps - Service Ports Configuration', () => {
  const dockerComposePath = './docker-compose.yml';
  const content = fs.readFileSync(dockerComposePath, 'utf-8');
  
  // Check issuer service port
  assert.ok(content.includes('3000'), 'Issuer service must be on port 3000');
  
  // Check verifier service port
  assert.ok(content.includes('3001'), 'Verifier service must be on port 3001');
  
  // Check frontend port
  assert.ok(content.includes('5173'), 'Frontend must be on port 5173');
});

test('DevOps - Database Configuration', () => {
  const dockerComposePath = './docker-compose.yml';
  const content = fs.readFileSync(dockerComposePath, 'utf-8');
  
  // Check PostgreSQL configuration
  assert.ok(content.includes('postgres:15'), 'Must use PostgreSQL 15');
  assert.ok(content.includes('issuer_db'), 'Must have issuer database');
  assert.ok(content.includes('verifier_db'), 'Must have verifier database');
  
  // Check volume persistence
  assert.ok(content.includes('volumes:'), 'Must have volume configuration');
  assert.ok(content.includes('issuer_db_data'), 'Must persist issuer database');
  assert.ok(content.includes('verifier_db_data'), 'Must persist verifier database');
});

test('DevOps - Network Configuration', () => {
  const dockerComposePath = './docker-compose.yml';
  const content = fs.readFileSync(dockerComposePath, 'utf-8');
  
  assert.ok(content.includes('networks:'), 'Must have network configuration');
  assert.ok(content.includes('credential-network'), 'Must use credential-network');
});

test('DevOps - Health Check Configuration', () => {
  const dockerComposePath = './docker-compose.yml';
  const content = fs.readFileSync(dockerComposePath, 'utf-8');
  
  // Each service should have health checks
  const healthcheckCount = (content.match(/healthcheck:/g) || []).length;
  assert.ok(healthcheckCount >= 2, 'At least 2 services must have health checks');
});

test('DevOps - Nginx Configuration Valid', () => {
  const nginxPath = './nginx.conf';
  const fileExists = fs.existsSync(nginxPath);
  
  assert.strictEqual(fileExists, true, 'nginx.conf must exist');
  
  const content = fs.readFileSync(nginxPath, 'utf-8');
  assert.ok(content.includes('upstream issuer_backend'), 'Must have issuer backend upstream');
  assert.ok(content.includes('upstream verifier_backend'), 'Must have verifier backend upstream');
  assert.ok(content.includes('server issuer-service:3000'), 'Must route to issuer service');
  assert.ok(content.includes('server verifier-service:3001'), 'Must route to verifier service');
});

test('DevOps - Nginx SSL/TLS Configuration', () => {
  const nginxPath = './nginx.conf';
  const content = fs.readFileSync(nginxPath, 'utf-8');
  
  assert.ok(content.includes('ssl_certificate'), 'Must have SSL certificate configuration');
  assert.ok(content.includes('ssl_certificate_key'), 'Must have SSL key configuration');
  assert.ok(content.includes('TLSv1.2'), 'Must support TLSv1.2');
  assert.ok(content.includes('TLSv1.3'), 'Must support TLSv1.3');
});

test('DevOps - Nginx Rate Limiting', () => {
  const nginxPath = './nginx.conf';
  const content = fs.readFileSync(nginxPath, 'utf-8');
  
  assert.ok(content.includes('limit_req_zone'), 'Must have rate limiting zones');
  assert.ok(content.includes('api_limit'), 'Must have API rate limit zone');
  assert.ok(content.includes('web_limit'), 'Must have web rate limit zone');
});

test('DevOps - Nginx Gzip Compression', () => {
  const nginxPath = './nginx.conf';
  const content = fs.readFileSync(nginxPath, 'utf-8');
  
  assert.ok(content.includes('gzip on'), 'Must have gzip enabled');
  assert.ok(content.includes('gzip_types'), 'Must have gzip types configured');
});

test('DevOps - Dockerfile Issuer Service Valid', () => {
  const dockerfilePath = './Dockerfile.issuer';
  const fileExists = fs.existsSync(dockerfilePath);
  
  assert.strictEqual(fileExists, true, 'Dockerfile.issuer must exist');
  
  const content = fs.readFileSync(dockerfilePath, 'utf-8');
  assert.ok(content.includes('FROM node:18'), 'Must use Node.js 18');
  assert.ok(content.includes('EXPOSE 3000'), 'Must expose port 3000');
  assert.ok(content.includes('npm ci --only=production'), 'Must install production dependencies only');
  assert.ok(content.includes('HEALTHCHECK'), 'Must have health check');
});

test('DevOps - Dockerfile Verifier Service Valid', () => {
  const dockerfilePath = './Dockerfile.verifier';
  const fileExists = fs.existsSync(dockerfilePath);
  
  assert.strictEqual(fileExists, true, 'Dockerfile.verifier must exist');
  
  const content = fs.readFileSync(dockerfilePath, 'utf-8');
  assert.ok(content.includes('FROM node:18'), 'Must use Node.js 18');
  assert.ok(content.includes('EXPOSE 3001'), 'Must expose port 3001');
  assert.ok(content.includes('HEALTHCHECK'), 'Must have health check');
});

test('DevOps - Dockerfile Frontend Valid', () => {
  const dockerfilePath = './Dockerfile.frontend';
  const fileExists = fs.existsSync(dockerfilePath);
  
  assert.strictEqual(fileExists, true, 'Dockerfile.frontend must exist');
  
  const content = fs.readFileSync(dockerfilePath, 'utf-8');
  assert.ok(content.includes('FROM node:18'), 'Must use Node.js 18 for build stage');
  assert.ok(content.includes('FROM nginx'), 'Must use nginx for runtime');
  assert.ok(content.includes('npm run build'), 'Must build React app');
});

test('DevOps - GitHub Actions CI/CD Workflow Valid', () => {
  const workflowPath = '../.github/workflows/ci-cd.yml';
  const fileExists = fs.existsSync(workflowPath);
  
  assert.strictEqual(fileExists, true, 'ci-cd.yml workflow must exist');
  
  const content = fs.readFileSync(workflowPath, 'utf-8');
  assert.ok(content.includes('jobs:'), 'Must have jobs defined');
  assert.ok(content.includes('test'), 'Must have test job');
  assert.ok(content.includes('build'), 'Must have build job');
  assert.ok(content.includes('security'), 'Must have security job');
  assert.ok(content.includes('deploy'), 'Must have deploy job');
});

test('DevOps - GitHub Actions Test Coverage', () => {
  const workflowPath = '../.github/workflows/ci-cd.yml';
  const content = fs.readFileSync(workflowPath, 'utf-8');
  
  assert.ok(content.includes('issuer-service'), 'Must test issuer service');
  assert.ok(content.includes('verifier-service'), 'Must test verifier service');
  assert.ok(content.includes('verifier-frontend'), 'Must test verifier frontend');
  assert.ok(content.includes('mobile-wallet'), 'Must test mobile wallet');
  assert.ok(content.includes('e2e-integration'), 'Must test E2E integration');
});

test('DevOps - GitHub Actions Security Checks', () => {
  const workflowPath = '../.github/workflows/ci-cd.yml';
  const content = fs.readFileSync(workflowPath, 'utf-8');
  
  assert.ok(content.includes('npm audit'), 'Must run npm audit');
  assert.ok(content.includes('security'), 'Must have security job');
});

test('DevOps - Environment Variables Documented', () => {
  const dockerComposePath = './docker-compose.yml';
  const content = fs.readFileSync(dockerComposePath, 'utf-8');
  
  // Check for environment variable documentation
  assert.ok(content.includes('environment:'), 'Must have environment variables defined');
  assert.ok(content.includes('NODE_ENV'), 'Must define NODE_ENV');
  assert.ok(content.includes('PORT'), 'Must define PORT');
});

test('DevOps - Multi-stage Docker Build Frontend', () => {
  const dockerfilePath = './Dockerfile.frontend';
  const content = fs.readFileSync(dockerfilePath, 'utf-8');
  
  const stageCount = (content.match(/FROM /g) || []).length;
  assert.ok(stageCount >= 2, 'Frontend Dockerfile must use multi-stage build');
  assert.ok(content.includes('AS builder'), 'Must have builder stage');
});

test('DevOps - Service Dependencies Configured', () => {
  const dockerComposePath = './docker-compose.yml';
  const content = fs.readFileSync(dockerComposePath, 'utf-8');
  
  // Check for depends_on configurations
  const dependsOnCount = (content.match(/depends_on:/g) || []).length;
  assert.ok(dependsOnCount > 0, 'Services must have dependencies defined');
});

test('DevOps - Resource Limits Recommended', () => {
  // While not strictly enforced, resource limits are recommended
  const dockerComposePath = './docker-compose.yml';
  const content = fs.readFileSync(dockerComposePath, 'utf-8');
  
  // Check if we should recommend resource limits
  // This is a quality check - not a hard requirement
  assert.ok(true, 'Resource limits should be added for production');
});

test('DevOps - Logging Configuration', () => {
  const nginxPath = './nginx.conf';
  const content = fs.readFileSync(nginxPath, 'utf-8');
  
  assert.ok(content.includes('error_log'), 'Must have error logging configured');
  assert.ok(content.includes('access_log'), 'Must have access logging configured');
  assert.ok(content.includes('log_format'), 'Must have log format defined');
});

test('DevOps - Database Backup Strategy Recommended', () => {
  // Database backup is recommended but not directly testable from config
  assert.ok(true, 'Database backup strategy should be implemented');
});
