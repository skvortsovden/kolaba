# Kolaba Plugin Tests

This directory contains comprehensive tests for the Kolaba Obsidian plugin using Gherkin (Cucumber) for behavior-driven development.

## Test Structure

```
tests/
├── features/                 # Gherkin feature files
│   ├── authentication.feature      # GitHub authentication scenarios
│   ├── repository_management.feature # Repository selection and management
│   ├── file_synchronization.feature  # File sync operations
│   ├── ui_interactions.feature      # User interface testing
│   └── error_handling.feature       # Error scenarios and edge cases
├── step_definitions/         # Step implementation files
│   ├── authentication_steps.ts     # Auth-related step implementations
│   ├── repository_steps.ts         # Repository management steps
│   ├── sync_steps.ts               # Sync operation steps
│   ├── ui_steps.ts                 # UI interaction steps
│   └── error_handling_steps.ts     # Error handling steps
└── support/                  # Test support files
    ├── mocks.ts                    # Mock implementations for Obsidian API
    ├── world.ts                    # Test world setup and teardown
    ├── jest.setup.ts               # Jest configuration
    └── obsidian.mock.ts            # Obsidian API mocks for Jest
```

## Running Tests

### Prerequisites
Make sure all dependencies are installed:
```bash
npm install
```

### Run All Tests
```bash
npm run test:all
```

### Run Unit Tests (Jest)
```bash
npm run test
```

### Run BDD Tests (Cucumber)
```bash
npm run test:cucumber
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Watch Mode (for development)
```bash
npm run test:watch
```

## Test Features

### 1. Authentication (authentication.feature)
- **Purpose**: Tests GitHub authentication flow
- **Scenarios**:
  - Successful authentication with valid token
  - Failed authentication with invalid token
  - Empty token validation
  - Re-authentication with different token
  - Network error handling

### 2. Repository Management (repository_management.feature)
- **Purpose**: Tests repository selection and management
- **Scenarios**:
  - Fetching repositories successfully
  - Refreshing repository list
  - Selecting repository from dropdown
  - Handling repository access errors
  - Empty repository list handling

### 3. File Synchronization (file_synchronization.feature)
- **Purpose**: Tests core sync functionality
- **Scenarios**:
  - Syncing with no changes
  - Detecting local file additions/modifications
  - Detecting remote file modifications
  - Handling remote-only files
  - Case conflict resolution
  - Pull and push operations
  - Device name in commit messages

### 4. UI Interactions (ui_interactions.feature)
- **Purpose**: Tests user interface behavior
- **Scenarios**:
  - Ribbon icon interaction
  - Sync view display states
  - Settings tab navigation
  - Diff view expansion/collapse
  - Button state management
  - Repository card display

### 5. Error Handling (error_handling.feature)
- **Purpose**: Tests error scenarios and edge cases
- **Scenarios**:
  - Network timeout handling
  - GitHub API rate limits
  - Invalid repository access
  - Corrupted file handling
  - Binary file filtering
  - Large file handling
  - Git repository issues
  - Concurrent operation prevention
  - Plugin recovery after errors

## Mock System

The test suite includes comprehensive mocks for:

- **Obsidian API**: Complete mock implementation of Obsidian's plugin API
- **GitHub API**: Simulated GitHub API responses for various scenarios
- **File System**: Mock vault and file operations
- **Network Layer**: Configurable network behavior (delays, errors, rate limits)
- **Git Operations**: Mock Git functionality for cross-platform testing

## Test Data

Each test scenario uses realistic test data:
- Sample markdown files with various content types
- Different repository configurations
- Various error conditions and edge cases
- Multiple device and user scenarios

## Continuous Integration

These tests are designed to run in CI/CD environments and provide:
- Comprehensive coverage of all plugin functionality
- Regression testing for existing features
- Validation of new feature implementations
- Performance and reliability checks

## Writing New Tests

To add new test scenarios:

1. **Add Gherkin scenarios** to the appropriate `.feature` file
2. **Implement step definitions** in the corresponding `_steps.ts` file
3. **Update mocks** in `mocks.ts` if new API behavior is needed
4. **Run tests** to validate the implementation

Follow the existing patterns and naming conventions for consistency.
