export interface PasteTemplate {
  name: string;
  icon: string;
  language: string;
  content: string;
}

export const TEMPLATES: PasteTemplate[] = [
  {
    name: "API Response",
    icon: "{ }",
    language: "json",
    content: `{
  "status": 200,
  "data": {
    "id": 1,
    "name": "Example",
    "email": "user@example.com"
  },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 1
  }
}`,
  },
  {
    name: "Bug Report",
    icon: "!",
    language: "markdown",
    content: `## Bug Description

A clear description of the bug.

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Environment

- OS:
- Browser:
- Version: `,
  },
  {
    name: "Code Review",
    icon: "PR",
    language: "markdown",
    content: `## Review Summary

Brief description of changes.

## Changes

- [ ] Feature A implemented
- [ ] Feature B implemented
- [ ] Tests added

## Issues Found

### Critical
- None

### Suggestions
- Consider refactoring X for better readability

## Test Plan

\`\`\`
1. Run unit tests
2. Test edge cases
3. Verify UI behavior
\`\`\``,
  },
  {
    name: "SQL Query",
    icon: "DB",
    language: "sql",
    content: `-- Create table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert data
INSERT INTO users (username, email) VALUES
    ('alice', 'alice@example.com'),
    ('bob', 'bob@example.com');

-- Query
SELECT u.username, COUNT(*) as post_count
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
GROUP BY u.username
ORDER BY post_count DESC;`,
  },
  {
    name: "Dockerfile",
    icon: "D",
    language: "dockerfile",
    content: `FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]`,
  },
  {
    name: "Git Hook",
    icon: "G",
    language: "bash",
    content: `#!/bin/bash
# pre-commit hook

# Run linter
echo "Running linter..."
npm run lint
if [ $? -ne 0 ]; then
    echo "Linting failed. Please fix errors before committing."
    exit 1
fi

# Run tests
echo "Running tests..."
npm test
if [ $? -ne 0 ]; then
    echo "Tests failed. Please fix before committing."
    exit 1
fi

echo "All checks passed!"`,
  },
  {
    name: "CI/CD Config",
    icon: "CI",
    language: "yaml",
    content: `name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - run: echo "Deploying..."`,
  },
  {
    name: "README",
    icon: "R",
    language: "markdown",
    content: `# Project Name

Brief description of the project.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

\`\`\`bash
npm install
npm run dev
\`\`\`

## Usage

\`\`\`bash
npm start
\`\`\`

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/data | GET | Get all data |
| /api/data | POST | Create new |

## License

MIT`,
  },
];
