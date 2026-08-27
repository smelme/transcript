# Contributing to Transcript System

Thank you for your interest in contributing! This document outlines our development practices and workflow.

## Story-Gated Development

**All development work must be tied to a GitHub story/issue.** No uncaptured work is allowed.

1. **Before Starting**: Ensure a story exists in GitHub Projects
2. **During**: Link your branch/PR to the story
3. **After**: Close the story when PR is merged and all acceptance criteria are met

**Branch Naming**:
```
feature/story-id-short-description
fix/issue-id-short-description
```

Example: `feature/P0-1-transcript-schema-definition`

## Development Workflow

### 1. Create Feature Branch

```bash
git checkout -b feature/story-id-your-feature
```

### 2. Make Changes

- Write code following our style guide (see below)
- Add tests for new features (minimum 70% coverage)
- Commit messages should reference the story ID

**Example commit message**:
```
[P0-1] Define mDoc credential schema

- Add namespace definition for academic credentials
- Define credential schema fields
- Add validation logic
- Add unit tests

Closes #123
```

### 3. Run Quality Checks

```bash
# Test
npm run test --workspaces

# Lint
npm run lint --workspaces

# Format
npm run format --workspaces
```

All checks must pass before creating a PR.

### 4. Create Pull Request

1. Push your branch to GitHub
2. Create PR against `main` (or `develop` for longer-term features)
3. Link PR to GitHub issue/story
4. Provide clear description of changes
5. Request review from team members

**PR Description Template**:
```markdown
## Story
Closes #123

## Description
What changed and why?

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Tests pass
- [ ] No console.log left
- [ ] Lint passes

## Testing
How to test locally?

## Screenshots (if applicable)
```

### 5. Review & Merge

- Address review comments
- Get approval from at least one reviewer
- Squash commits if requested
- Merge to main via GitHub UI
- Delete feature branch after merge

---

## Code Style Guide

### JavaScript/Node.js

- **Linter**: ESLint
- **Formatter**: Prettier
- **Style**: Use modern ES6+ syntax
- **No console.log**: Remove debug logs before committing
- **Comments**: Explain "why", not "what" the code does

Example:
```javascript
// ✓ Good: Explains the business logic
// Retry with exponential backoff if signature validation fails temporarily
async function validateWithRetry(credential, retries = 3) {
  // ...
}

// ✗ Bad: Obvious from code
// Create a variable
const result = await validate(credential);
```

### React/Vue Components

- **Functional components only**
- **Hooks for state management**
- **PropTypes or TypeScript for type safety**
- **Component naming**: PascalCase (CredentialList.jsx)
- **File naming**: Match component name

### Database

- **SQL**: Follow PostgreSQL conventions
- **Migrations**: Versioned, reversible
- **Naming**: snake_case for columns and tables
- **Indexes**: On foreign keys and frequently queried columns

### Git Commits

- **Atomic commits**: One logical change per commit
- **Clear messages**: Start with story ID, use imperative mood
- **Reference issues**: `Closes #123` or `Fixes #456`

---

## Testing

### Coverage Requirements

- **Minimum**: 70% line coverage
- **Backends**: Integration tests required
- **Frontends**: Component tests for new features

### Test File Naming

```
src/services/credential.js
tests/unit/services/credential.test.js

src/components/CredentialList.jsx
tests/unit/components/CredentialList.test.jsx
```

### Running Tests

```bash
# All workspaces
npm run test --workspaces

# Specific workspace
cd issuer-service && npm run test

# Watch mode
npm run test -- --watch

# Coverage
npm run test -- --coverage
```

---

## Security Guidelines

### Keys & Secrets
- **Never commit keys, passwords, or tokens**
- Use `.env.example` for template variables
- Add files to `.gitignore`

### Dependency Updates
- Review dependency changelogs before updating
- Run security audit: `npm audit`
- Keep dependencies up to date (especially security patches)

### Code Review Focus
- Check for SQL injection vulnerabilities
- Validate user input on backend
- Ensure secrets aren't logged or exposed
- Verify CORS/authentication properly configured

---

## Documentation

### Code Documentation
- **README.md** in each workspace explaining its purpose
- **JSDoc comments** for public APIs
- **Architecture decision records** for major decisions

Example JSDoc:
```javascript
/**
 * Generate ED25519 signature for credential data
 * @param {Object} credential - Credential data to sign
 * @param {string} privateKeyPath - Path to issuer's private key
 * @returns {Buffer} ED25519 signature
 * @throws {Error} If signing fails
 */
function signCredential(credential, privateKeyPath) {
  // ...
}
```

### Pull Request Descriptions
- Explain "what" and "why"
- Link to GitHub story
- Describe testing approach
- Mention breaking changes

---

## Review Checklist

Before creating a PR, verify:

- [ ] Code follows style guide (run `npm run lint && npm run format`)
- [ ] Tests written and passing (`npm run test`)
- [ ] No console.log or debug statements
- [ ] No secrets committed (.env files, keys)
- [ ] Documentation updated (README, JSDoc)
- [ ] Acceptance criteria from story satisfied
- [ ] PR linked to GitHub issue
- [ ] Branch based on latest main/develop

---

## Common Issues

### "Lint errors on commit"
- Run `npm run format --workspaces`
- Or fix manually and re-commit

### "Tests failing"
- Run tests locally: `npm run test --workspaces`
- Check if environment variables are set
- Review error message for clues

### "PR blocked by review"
- Address feedback and re-request review
- Don't force-push to main branch

---

## Getting Help

- **GitHub Discussions**: For questions and ideas
- **GitHub Issues**: For bugs and feature requests
- **Slack**: For urgent matters (if applicable)

---

## Acknowledgments

Thank you for contributing to the Transcript system! Your work helps make academic credential verification more accessible and secure.

---

**Last Updated**: 2026-08-27  
**Maintainers**: Smart College Team
