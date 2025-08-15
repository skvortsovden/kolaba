// Test-specific types and interfaces
import { Vault, TFile } from 'obsidian';

export interface FileDiff {
  filename: string;
  status: 'added' | 'modified' | 'remote-modified' | 'remote-only' | 'remote-added' | 'case-conflict-only' | 'deleted';
  additions: number;
  deletions: number;
  localContent: string;
  remoteContent: string;
  sha: string;
  remoteSha?: string;
  matchType?: string;
  localPath?: string;
}

export interface TestFile {
  path: string;
  content: string;
  sha?: string;
}

export interface TestVault extends Vault {
  files: TestFile[];
  createdFiles: TestFile[];
  modifiedFiles: TestFile[];
  setMockFiles(files: TestFile[]): void;
}

export interface MockApp {
  vault: TestVault;
  remoteFiles: TestFile[];
  hasNetworkError?: boolean;
  mockRemoteFiles(files: TestFile[]): void;
  mockNetworkError(): void;
}

export interface TestWorld {
  // Plugin instances
  realPlugin?: any; // Will be typed as KolabaPlugin when imported
  useRealPlugin: boolean;
  mockPlugin: any;
  
  // App and vault
  mockApp: MockApp;
  testVault: TestVault;
  
  // Test state
  authenticated: boolean;
  repositorySelected: boolean;
  syncViewOpen: boolean;
  syncStatus: string | null;
  buttonClicked: string | null;
  lastMessage: string | null;
  operationInProgress: boolean;
  pullCompleted: boolean;
  pushCompleted: boolean;
  gitCommitMade: boolean;
  
  // File states
  remoteOnlyFiles: string[];
  remoteModifiedFiles: string[];
  newFiles: string[];
  modifiedFiles: string[];
  
  // UI states
  pullButtonEnabled: boolean;
  pushButtonEnabled: boolean;
  remoteChangesVisible: boolean;
  
  // Repository management
  repositories: Array<{ name: string; full_name: string }>;
  repositoriesFetched: boolean;
  hasRepositoryAccess: boolean;
  
  // Utilities
  githubMock: any;
}
