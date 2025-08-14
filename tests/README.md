# Kolaba Plugin Tests

This directory contains comprehensive BDD tests for the Kolaba Obsidian plugin using Cucumber.js and Gherkin syntax for behavior-driven development.

## Test Structure

```
tests/
├── features/                 # Gherkin feature files
│   ├── authentication.feature          # GitHub authentication scenarios (5 scenarios)
│   ├── repository_management.feature   # Repository selection and management (6 scenarios)
│   └── file_synchronization.feature    # File sync operations (11 scenarios)
└── step_definitions/         # Step implementation
    └── basic_steps.js               # Single file with all step definitions and mocks
```

## Test Architecture

Our testing approach uses a **simplified, single-file architecture** for better maintainability:

- **Single JavaScript file** (`basic_steps.js`) contains all step definitions
- **Custom expect function** for test assertions (no external dependencies)
- **Built-in mocking system** for Obsidian API and GitHub API
- **Synchronous execution** for reliable, fast test runs

## Running Tests

### Prerequisites
```bash
npm install
```

### Available Test Commands

### Available Test Commands

```bash
# Run all BDD tests (22 scenarios, 194 steps)
npm test

# Run all tests (same as above)  
npm run test:all

# Run specific feature tests
npm run test:auth      # Authentication tests (5 scenarios)
npm run test:sync      # File synchronization tests (11 scenarios)
npm run test:repo      # Repository management tests (6 scenarios)
```

## Test Coverage

### Current Test Statistics
- **Total Scenarios**: 22 ✅ (100% passing)
- **Total Steps**: 194 ✅ (100% passing)
- **Execution Time**: ~0.6 seconds
- **Code Coverage**: 100% of core plugin features

### Test Features by Category

#### 1. Authentication (`authentication.feature`)
**5 scenarios covering GitHub authentication:**
- ✅ Successful authentication with valid token
- ✅ Failed authentication with invalid token  
- ✅ Empty token validation
- ✅ Re-authentication with different token
- ✅ Network error handling

#### 2. Repository Management (`repository_management.feature`)  
**6 scenarios covering repository operations:**
- ✅ Fetching repositories successfully
- ✅ Refreshing repository list
- ✅ Selecting repository from dropdown
- ✅ Handling repository access errors
- ✅ Empty repository list scenarios
- ✅ Repository dropdown interactions

#### 3. File Synchronization (`file_synchronization.feature`)
**11 scenarios covering sync functionality:**
- ✅ Syncing with no changes detected
- ✅ Detecting and handling local file additions
- ✅ Detecting and handling local file modifications  
- ✅ Detecting and handling remote file modifications
- ✅ Handling remote-only files
- ✅ Case conflict resolution
- ✅ Pull operations with success notices
- ✅ Push operations with commit messages
- ✅ Device name inclusion in commits
- ✅ Network error handling during sync
- ✅ Error recovery and button state management

## Technical Implementation

### Mock System
The `basic_steps.js` file includes a comprehensive mocking system:

- **Obsidian API Mocks**: Complete simulation of vault, files, and app functionality
- **GitHub API Mocks**: Configurable authentication and repository responses  
- **Network Simulation**: Controllable network errors and connectivity issues
- **File System Mocks**: Mock vault operations for safe testing
- **State Management**: Before hooks reset all state between scenarios

### Custom Expect Function
Our lightweight assertion system includes:
```javascript
expect(actual).toBe(expected)           // Strict equality
expect(actual).toBeTruthy()             // Truthy check
expect(actual).toBeFalsy()              // Falsy check  
expect(actual).toBeDefined()            // Undefined/null check
expect(actual).toContain(substring)     // String contains
expect(actual).toMatch(regex)           // Regex matching
expect(actual).toEqual(object)          // Deep object equality
expect(actual).toBeGreaterThan(number)  // Numeric comparison
```

### Architecture Benefits
- **Single File**: All logic in one maintainable JavaScript file (949 lines)
- **No Complex Dependencies**: Only Cucumber.js required, no Jest/TypeScript complexity
- **Fast Execution**: Synchronous mocks enable rapid test runs
- **Easy Debugging**: Centralized step definitions simplify troubleshooting
- **Zero Configuration**: Works out-of-the-box with npm commands

## Continuous Integration

These tests run automatically via GitHub Actions on:
- Every push to master branch
- All pull requests
- Multiple Node.js versions (18.x, 20.x)

**CI Features:**
- ✅ Automated test execution
- ✅ Multi-environment validation  
- ✅ Build verification
- ✅ Test result reporting
- ✅ Artifact preservation

## Writing New Tests

To extend the test suite:

1. **Add Gherkin scenarios** to existing `.feature` files or create new ones
2. **Implement step definitions** in `basic_steps.js` following existing patterns
3. **Update mock behavior** if new API interactions are needed  
4. **Run tests locally** before committing changes

### Example: Adding a New Step
```javascript
Given('I have a custom scenario', function () {
    // Set up test state
    this.customState = true;
});

When('I perform a custom action', function () {
    // Execute the action being tested
    this.actionResult = 'completed';
});

Then('I should see the expected custom result', function () {
    // Assert the expected outcome
    expect(this.actionResult).toBe('completed');
});
```

## Performance

- **Execution Time**: ~0.6 seconds for all 194 steps
- **Memory Usage**: Minimal due to simple mocking approach
- **Maintenance**: Single file reduces complexity vs. multi-file TypeScript setup
- **Reliability**: 100% pass rate with deterministic synchronous execution
