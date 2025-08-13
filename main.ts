import { App, Notice, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile, TFolder } from 'obsidian';

const VIEW_TYPE_SYNC = 'sync-view';
const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = 'Obsidian-Sync-Plugin';
const EMPTY_TOKEN_ERROR = 'Please provide a GitHub token';

interface KolabaPluginSettings {
	githubToken: string;
	username: string;
	repositories: string[];
	selectedRepository: string;
	deviceName: string;
}

const DEFAULT_SETTINGS: KolabaPluginSettings = {
	githubToken: '',
	username: '',
	repositories: [],
	selectedRepository: '',
	deviceName: ''
}

export default class KolabaPlugin extends Plugin {
	settings: KolabaPluginSettings;

	private createGitHubHeaders(token: string) {
		return {
			'Authorization': `token ${token}`,
			'User-Agent': USER_AGENT,
			'Accept': 'application/vnd.github.v3+json'
		};
	}

	async checkGitHubAuth(token: string): Promise<{status: string, username: string}> {
		if (!token?.trim()) {
			return {status: EMPTY_TOKEN_ERROR, username: ''};
		}

		try {
			const response = await fetch(`${GITHUB_API_BASE}/user`, {
				headers: this.createGitHubHeaders(token)
			});

			if (response.ok) {
				const userData = await response.json();
				return {
					status: `✅ Successfully authenticated as ${userData.login}`,
					username: userData.login
				};
			} else if (response.status === 401) {
				return {status: '❌ Invalid token - authentication failed', username: ''};
			} else {
				return {status: `❌ GitHub API error: ${response.status} ${response.statusText}`, username: ''};
			}
		} catch (error) {
			return {status: `❌ Network error: ${error.message}`, username: ''};
		}
	}

	async fetchGitHubRepositories(token: string): Promise<{success: boolean, repositories: string[], error?: string}> {
		if (!token?.trim()) {
			return {success: false, repositories: [], error: EMPTY_TOKEN_ERROR};
		}

		try {
			const response = await fetch(`${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated`, {
				headers: this.createGitHubHeaders(token)
			});

			if (response.ok) {
				const repos = await response.json();
				const repoNames = repos.map((repo: any) => `${repo.owner.login}/${repo.name}`);
				return {success: true, repositories: repoNames};
			} else if (response.status === 401) {
				return {success: false, repositories: [], error: 'Invalid token - authentication failed'};
			} else {
				return {success: false, repositories: [], error: `GitHub API error: ${response.status} ${response.statusText}`};
			}
		} catch (error) {
			return {success: false, repositories: [], error: `Network error: ${error.message}`};
		}
	}

	async fetchGitHubContents(token: string, repoPath: string, path: string = ''): Promise<{success: boolean, contents: any[], error?: string}> {
		if (!token?.trim()) {
			return {success: false, contents: [], error: EMPTY_TOKEN_ERROR};
		}

		try {
			const url = `${GITHUB_API_BASE}/repos/${repoPath}/contents/${path}`;
			const response = await fetch(url, {
				headers: this.createGitHubHeaders(token)
			});

			if (response.ok) {
				const contents = await response.json();
				// Ensure we always return an array
				return {success: true, contents: Array.isArray(contents) ? contents : [contents]};
			} else if (response.status === 404) {
				// Repository or path not found, return empty contents
				return {success: true, contents: []};
			} else if (response.status === 401) {
				return {success: false, contents: [], error: 'Invalid token - authentication failed'};
			} else {
				return {success: false, contents: [], error: `GitHub API error: ${response.status} ${response.statusText}`};
			}
		} catch (error) {
			return {success: false, contents: [], error: `Network error: ${error.message}`};
		}
	}

	async fetchFileContent(token: string, repoPath: string, filePath: string): Promise<{success: boolean, content: string, sha: string, error?: string}> {
		if (!token?.trim()) {
			return {success: false, content: '', sha: '', error: EMPTY_TOKEN_ERROR};
		}

		try {
			// Properly encode the file path to handle special characters
			const encodedFilePath = encodeURIComponent(filePath).replace(/%2F/g, '/');
			const url = `${GITHUB_API_BASE}/repos/${repoPath}/contents/${encodedFilePath}`;
			
			const response = await fetch(url, {
				headers: this.createGitHubHeaders(token)
			});

			if (response.ok) {
				const fileData = await response.json();
				if (fileData.type === 'file') {
					if (fileData.content) {
						// Properly decode base64 content with UTF-8 encoding
						const base64Content = fileData.content.replace(/\n/g, '');
						
						// Convert base64 to bytes, then to UTF-8 string
						const binaryString = atob(base64Content);
						const bytes = new Uint8Array(binaryString.length);
						for (let i = 0; i < binaryString.length; i++) {
							bytes[i] = binaryString.charCodeAt(i);
						}
						
						// Decode bytes as UTF-8
						const decoder = new TextDecoder('utf-8');
						const content = decoder.decode(bytes);
						return {success: true, content, sha: fileData.sha || ''};
					} else {
						// File exists but has no content (empty file)
						return {success: true, content: '', sha: fileData.sha || ''};
					}
				} else if (fileData.type === 'dir') {
					return {success: false, content: '', sha: '', error: `Path is a directory, not a file`};
				} else {
					return {success: false, content: '', sha: '', error: `Unknown content type: ${fileData.type}`};
				}
			} else if (response.status === 404) {
				return {success: true, content: '', sha: ''}; // File doesn't exist remotely
			} else if (response.status === 401) {
				return {success: false, content: '', sha: '', error: 'Invalid token - authentication failed'};
			} else {
				return {success: false, content: '', sha: '', error: `GitHub API error: ${response.status} ${response.statusText}`};
			}
		} catch (error) {
			return {success: false, content: '', sha: '', error: `Network error: ${error.message}`};
		}
	}

	async onload() {
		await this.loadSettings();
		

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('folder-sync', 'Kolaba', (evt: MouseEvent) => {
			// Open the sync sidebar when clicked
			this.activateSyncView();
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new KolabaSettingTab(this.app, this));

		// Register the sync view
		this.registerView(VIEW_TYPE_SYNC, (leaf) => new SyncView(leaf, this));

	}

	async activateSyncView() {
		const { workspace } = this.app;

		let leaf = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_SYNC);

		if (leaves.length > 0) {
			// If view already exists, just activate it
			leaf = leaves[0];
		} else {
			// Create new view in right sidebar
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_SYNC, active: true });
			}
		}

		// Reveal the right sidebar and focus the view
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class KolabaSettingTab extends PluginSettingTab {
	plugin: KolabaPlugin;

	constructor(app: App, plugin: KolabaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('GitHub Token')
			.setDesc('Enter your GitHub personal access token')
			.addText(text => text
				.setPlaceholder('Enter your token here')
				.setValue(this.plugin.settings.githubToken)
				.onChange(async (value) => {
					this.plugin.settings.githubToken = value;
					await this.plugin.saveSettings();
					// Clear username, repositories and selected repository when token changes
					this.plugin.settings.username = '';
					this.plugin.settings.repositories = [];
					this.plugin.settings.selectedRepository = '';
					await this.plugin.saveSettings();
					this.display(); // Refresh the entire display
				}));

		new Setting(containerEl)
			.setName('Device Name')
			.setDesc('Optional name for this device (will be included in commit messages)')
			.addText(text => text
				.setPlaceholder('e.g., laptop, desktop, mobile')
				.setValue(this.plugin.settings.deviceName)
				.onChange(async (value) => {
					this.plugin.settings.deviceName = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Test Connection')
			.setDesc('Click to verify your GitHub token')
			.addButton(button => button
				.setButtonText(this.plugin.settings.username ? 'Re login' : 'Log in')
				.onClick(async () => {
					button.setButtonText('Testing...');
					button.setDisabled(true);
					
					const result = await this.plugin.checkGitHubAuth(this.plugin.settings.githubToken);
					this.plugin.settings.username = result.username;
					await this.plugin.saveSettings();
					
					this.display(); // Refresh the entire display to show/hide username
					button.setButtonText(this.plugin.settings.username ? 'Re login' : 'Log in');
					button.setDisabled(false);
				}));

		// Show username if authenticated
		if (this.plugin.settings.username) {
			new Setting(containerEl)
				.setName('Logged in as')
				.setDesc(`GitHub user: ${this.plugin.settings.username}`)
				.setClass('github-user-info');

			// Add repository listing section
			new Setting(containerEl)
				.setName('GitHub Repositories')
				.setDesc('List all repositories for the authenticated user')
				.addButton(button => button
					.setButtonText(this.plugin.settings.repositories.length > 0 ? 'Refresh repositories' : 'Fetch repositories')
					.onClick(async () => {
						button.setButtonText('Loading...');
						button.setDisabled(true);
						
						const result = await this.plugin.fetchGitHubRepositories(this.plugin.settings.githubToken);
						if (result.success) {
							this.plugin.settings.repositories = result.repositories;
							// Clear selected repository when repositories are refreshed
							this.plugin.settings.selectedRepository = '';
							await this.plugin.saveSettings();
							new Notice(`Found ${result.repositories.length} repositories`);
						} else {
							new Notice(`Error: ${result.error}`);
						}
						
						this.display(); // Refresh to show repositories dropdown
						button.setButtonText(this.plugin.settings.repositories.length > 0 ? 'Refresh repositories' : 'Fetch repositories');
						button.setDisabled(false);
					}));

			// Show repositories dropdown if available
			if (this.plugin.settings.repositories && this.plugin.settings.repositories.length > 0) {
				new Setting(containerEl)
					.setName('Select Repository')
					.setDesc('Choose a repository to work with')
					.setClass('full-width-dropdown')
					.addDropdown(dropdown => {
						// Add empty option
						dropdown.addOption('', '-- Select a repository --');
						
						// Add all repositories as options
						this.plugin.settings.repositories.forEach(repo => {
							dropdown.addOption(repo, repo);
						});
						
						// Set current value
						dropdown.setValue(this.plugin.settings.selectedRepository);
						
						// Handle selection change
						dropdown.onChange(async (value) => {
							this.plugin.settings.selectedRepository = value;
							await this.plugin.saveSettings();
							this.display(); // Refresh to show selected repository info
						});
					});
			}
		}

		// Show selected repository info if one is selected
		if (this.plugin.settings.selectedRepository) {
			new Setting(containerEl)
				.setName('Selected repository')
				.setDesc(`Repository: ${this.plugin.settings.selectedRepository}`)
				.setClass('github-user-info');
		}
	}
}

class SyncView extends ItemView {
	plugin: KolabaPlugin;
	private syncButton: HTMLButtonElement | null = null;
	private pullButton: HTMLButtonElement | null = null;
	private pushButton: HTMLButtonElement | null = null;
	private diffContainer: HTMLElement | null = null;
	private currentDiffs: any[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: KolabaPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_SYNC;
	}

	getDisplayText() {
		return 'Kolaba';
	}

	getIcon() {
		return 'folder-sync';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.createEl('h2', { text: 'Kolaba' });

		// Show selected repository if available
		if (this.plugin.settings.selectedRepository) {

			// Improved repository card UI
			const repoSection = container.createEl('div', { cls: 'sync-repo-card' });
			const repoHeader = repoSection.createEl('div', { cls: 'sync-repo-card-header' });
			repoHeader.createEl('span', { text: '📦', cls: 'sync-repo-card-icon' });
			repoHeader.createEl('span', { text: 'Selected Repository', cls: 'sync-repo-card-title' });

			const repoBody = repoSection.createEl('div', { cls: 'sync-repo-card-body' });
			repoBody.createEl('span', { text: this.plugin.settings.selectedRepository, cls: 'sync-repo-card-name' });

			// Add three buttons in a row
			const buttonContainer = container.createEl('div', { cls: 'sync-button-container' });
			
			this.syncButton = buttonContainer.createEl('button', {
				text: 'Sync',
				cls: 'mod-cta sync-button'
			});

			this.pullButton = buttonContainer.createEl('button', {
				text: 'Pull',
				cls: 'sync-button'
			});

			this.pushButton = buttonContainer.createEl('button', {
				text: 'Push',
				cls: 'sync-button'
			});

			// Initially disable pull and push buttons
			this.pullButton.disabled = true;
			this.pushButton.disabled = true;

			// Add event listeners
			this.syncButton.addEventListener('click', () => {
				this.handleSyncClick();
			});

			this.pullButton.addEventListener('click', () => {
				this.handlePullClick();
			});

			this.pushButton.addEventListener('click', () => {
				this.handlePushClick();
			});

			// Container for diff results
			this.diffContainer = container.createEl('div', { cls: 'sync-diff-container' });

		} else {
			const noRepoSection = container.createEl('div', { cls: 'sync-no-repo-section' });
			noRepoSection.createEl('p', { 
				text: 'No repository selected. Configure GitHub settings first.',
				cls: 'sync-no-repo-message'
			});
		}
	}

	async handleSyncClick() {
		if (!this.syncButton || !this.diffContainer) return;

		// Change button text and disable
		this.syncButton.textContent = 'Syncing...';
		this.syncButton.disabled = true;
		this.pullButton!.disabled = true;
		this.pushButton!.disabled = true;

		try {
			// Fetch diffs
			this.currentDiffs = await this.fetchDiffs();
			
			// Display diff results
			this.displayDiffs(this.currentDiffs);
			
			// Reset sync button and enable pull/push based on what changes exist
			this.syncButton.textContent = 'Sync';
			this.syncButton.disabled = false;
			
			// Enable pull button if there are remote changes, local modifications, or remote-only files
			const hasRemoteChanges = this.currentDiffs.some(diff => 
			   diff.status === 'remote-modified' || 
			   diff.status === 'case-conflict-only' ||
			   diff.status === 'modified' ||
			   diff.status === 'remote-only' // Allow pulling remote-only files
			);
			this.pullButton!.disabled = !hasRemoteChanges;

		   // Enable push button if there are local changes or remote-only files to delete
		   const hasPushableChanges = this.currentDiffs.some(diff => 
			   diff.status === 'added' || 
			   diff.status === 'modified' || 
			   diff.status === 'remote-only'
		   );
		   this.pushButton!.disabled = !hasPushableChanges;

		} catch (error) {
			// Handle error
			this.diffContainer.empty();
			this.diffContainer.createEl('div', {
				text: `Error fetching diffs: ${error.message}`,
				cls: 'sync-error'
			});
			
			// Reset buttons
			this.syncButton.textContent = 'Sync';
			this.syncButton.disabled = false;
			this.pullButton!.disabled = true;
			this.pushButton!.disabled = true;
		}
	}

	async handlePullClick() {
		if (!this.pullButton || !this.diffContainer) return;

		// Change button text and disable
		this.pullButton.textContent = 'Pulling...';
		this.pullButton.disabled = true;
		this.syncButton!.disabled = true;
		this.pushButton!.disabled = true;

		try {

			// Filter for remote changes, local modifications, and remote-only files
			const remoteDiffs = this.currentDiffs.filter(diff => 
			   diff.status === 'remote-modified' || 
			   diff.status === 'case-conflict-only' ||
			   diff.status === 'modified' ||
			   diff.status === 'remote-only'
			);

			if (remoteDiffs.length === 0) {
				new Notice('No remote changes, local modifications, or remote-only files to pull');
				this.pullButton.textContent = 'Pull';
				this.pullButton.disabled = false;
				this.syncButton!.disabled = false;
				return;
			}

			// Process remote changes and remote-only files
			await this.performPull(remoteDiffs);
			
			// Success
			new Notice(`Successfully pulled ${remoteDiffs.length} file${remoteDiffs.length === 1 ? '' : 's'}`);
			
			// Refresh diffs after pull
			this.currentDiffs = await this.fetchDiffs();
			this.displayDiffs(this.currentDiffs);
			
			// Reset buttons
			this.pullButton.textContent = 'Pull';
			this.syncButton!.disabled = false;
			
			// Update button states
			const hasRemoteChanges = this.currentDiffs.some(diff => 
				diff.status === 'remote-modified' || 
				diff.status === 'case-conflict-only' ||
				diff.status === 'modified'  // Allow pulling remote version to overwrite local changes
			);
			this.pullButton.disabled = !hasRemoteChanges;
			
		   const hasLocalChanges = this.currentDiffs.some(diff => 
			   diff.status === 'added' || 
			   diff.status === 'modified' || 
			   diff.status === 'remote-only'
		   );
		   this.pushButton!.disabled = !hasLocalChanges;

		} catch (error) {
			// Handle error
			console.error('Pull failed:', error);
			new Notice(`Pull failed: ${error.message}`);
			
			// Reset buttons
			this.pullButton.textContent = 'Pull';
			this.pullButton.disabled = false;
			this.syncButton!.disabled = false;
		}
	}

	async handlePushClick() {
		if (!this.pushButton || !this.diffContainer) return;

		// Change button text and disable
		this.pushButton.textContent = 'Pushing...';
		this.pushButton.disabled = true;
		this.syncButton!.disabled = true;
		this.pullButton!.disabled = true;

		try {
		   // Filter for pushable changes: local changes and remote-only files to delete
		   const pushableDiffs = this.currentDiffs.filter(diff => 
			   diff.status === 'added' || 
			   diff.status === 'modified' || 
			   diff.status === 'remote-only'
		   );

			if (pushableDiffs.length === 0) {
				new Notice('No changes to push');
				this.pushButton.textContent = 'Push';
				this.pushButton.disabled = false;
				this.syncButton!.disabled = false;
				return;
			}

			// Process all pushable changes
			await this.performPush(pushableDiffs);

			// Success
			new Notice(`Successfully pushed ${pushableDiffs.length} file${pushableDiffs.length === 1 ? '' : 's'}`);

			// Refresh diffs after push
			this.currentDiffs = await this.fetchDiffs();
			this.displayDiffs(this.currentDiffs);

			// Reset buttons
			this.pushButton.textContent = 'Push';
			this.syncButton!.disabled = false;

			// Update button states
			const hasRemoteChanges = this.currentDiffs.some(diff => 
				diff.status === 'remote-modified' || 
				diff.status === 'case-conflict-only' ||
				diff.status === 'modified'  // Allow pulling remote version to overwrite local changes
			);
			this.pullButton!.disabled = !hasRemoteChanges;

			const hasPushableChanges = this.currentDiffs.some(diff => 
				diff.status === 'added' || 
				diff.status === 'modified' || 
				diff.status === 'deleted'
			);
			this.pushButton.disabled = !hasPushableChanges;

		} catch (error) {
			// Handle error
			console.error('Push failed:', error);
			new Notice(`Push failed: ${error.message}`);

			// Reset buttons
			this.pushButton.textContent = 'Push';
			this.pushButton.disabled = false;
			this.syncButton!.disabled = false;
		}
	}

	async performPull(diffs: any[]) {
		const vault = this.plugin.app.vault;
		const processedFiles: string[] = [];

		console.log(`Starting pull process for ${diffs.length} files...`);

		// Handle remote changes (pull remote changes locally)
		for (const diff of diffs) {
			try {
				await this.pullRemoteChange(vault, diff);
				processedFiles.push(diff.filename);
				console.log(`Pulled remote changes for: ${diff.filename}`);
			} catch (error) {
				console.error(`Failed to pull remote changes for ${diff.filename}:`, error);
				throw new Error(`Failed to pull remote changes for ${diff.filename}: ${error.message}`);
			}
		}

		// Commit local changes using Git
		await this.commitLocalChanges(processedFiles);
		console.log('Committed pulled changes to Git');
	}

	async performPush(diffs: any[]) {
		const token = this.plugin.settings.githubToken;
		const repoPath = this.plugin.settings.selectedRepository;
		const processedFiles: string[] = [];

		console.log(`Starting push process for ${diffs.length} files...`);

		// Get the latest remote tree SHA for the push operation
		const currentBranchSha = await this.getCurrentBranchSha(token, repoPath);
		if (!currentBranchSha) {
			throw new Error('Could not get current branch SHA');
		}

		// Fetch the current remote tree to validate deletions
		const remoteTree = await this.fetchRemoteTree(token, repoPath);
		const remoteFilesSet = new Set(remoteTree ? Array.from(remoteTree.keys()) : []);

		// Create blobs for all local changes
		const fileBlobs: {path: string, sha: string, mode: string}[] = [];
		// Track deletions that actually exist on remote
		const deletions: string[] = [];

		for (const diff of diffs) {
			try {
			   if (diff.status === 'remote-only' || diff.status === 'remote-added') {
					// Only mark for deletion if file exists in remote tree
					if (remoteFilesSet.has(diff.filename)) {
						deletions.push(diff.filename);
						console.log(`Marked for deletion: ${diff.filename}`);
					} else {
						console.log(`Skip deletion for ${diff.filename} (not present in remote)`);
					}
				} else {
					// Create blob for added/modified files
					const blobSha = await this.createBlob(token, repoPath, diff.localContent);
					fileBlobs.push({
						path: diff.filename,
						sha: blobSha,
						mode: '100644' // Regular file mode
					});
					console.log(`Created blob for: ${diff.filename}`);
				}
				processedFiles.push(diff.filename);
			} catch (error) {
				console.error(`Failed to create blob for ${diff.filename}:`, error);
				throw new Error(`Failed to create blob for ${diff.filename}: ${error.message}`);
			}
		}

		// Get the current tree and create new tree
		const newTreeSha = await this.createTree(token, repoPath, currentBranchSha, fileBlobs, deletions);
		console.log(`Created new tree: ${newTreeSha}`);

		// Create commit
		const commitSha = await this.createCommit(token, repoPath, newTreeSha, currentBranchSha, processedFiles);
		console.log(`Created commit: ${commitSha}`);

		// Update branch reference
		await this.updateBranchRef(token, repoPath, commitSha);
		console.log(`Updated branch reference to: ${commitSha}`);

		// Stage and commit local changes using Git
		await this.commitLocalChanges(processedFiles);
		console.log('Committed local changes to Git');
	}

	async pullRemoteChange(vault: any, diff: any) {
		// Write remote content to local file
		const filePath = diff.filename;
		
		if (diff.status === 'remote-added') {
			// Check for case-insensitive conflicts
			const conflictingFile = this.findCaseInsensitiveFile(vault, filePath);
			
			if (conflictingFile) {
				console.log(`Case conflict detected: remote '${filePath}' conflicts with local '${conflictingFile.path}'`);
				
				// Handle case conflict - create both files for manual resolution
				if (conflictingFile.path.toLowerCase() === filePath.toLowerCase()) {
					// Same file with different case - show user both versions
					console.log(`Creating conflict files for manual resolution`);
					
					// Create the remote file with a conflict suffix
					const conflictPath = this.generateConflictPath(filePath, 'remote');
					await vault.create(conflictPath, diff.remoteContent);
					
					// Also create a backup of the local file
					const localBackupPath = this.generateConflictPath(conflictingFile.path, 'local');
					const localContent = await vault.read(conflictingFile);
					await vault.create(localBackupPath, localContent);
					
					// Show notice to user
					new Notice(`Case conflict found! Created conflict files:\n- ${conflictPath} (remote)\n- ${localBackupPath} (local backup)\nPlease merge manually and delete the conflict files.`, 10000);
					return;
				} else {
					// Different files but similar names - create with conflict suffix
					const conflictPath = this.generateConflictPath(filePath, 'remote');
					console.log(`Creating conflicted file: ${conflictPath}`);
					await vault.create(conflictPath, diff.remoteContent);
					return;
				}
			}
			
			// No conflict - create normally
			await vault.create(filePath, diff.remoteContent);
		} else if (diff.status === 'remote-modified') {
			// First try exact path match
			let existingFile = vault.getAbstractFileByPath(filePath);
			
			// If not found, try case-insensitive search
			if (!existingFile) {
				const conflictingFile = this.findCaseInsensitiveFile(vault, filePath);
				if (conflictingFile) {
					console.log(`Case-insensitive match found: updating '${conflictingFile.path}' with remote content from '${filePath}'`);
					existingFile = conflictingFile;
				}
			}
			
			if (existingFile) {
				await vault.modify(existingFile, diff.remoteContent);
			} else {
				// File doesn't exist locally, create it
				await vault.create(filePath, diff.remoteContent);
			}
		} else if (diff.status === 'modified') {
			// Handle local modifications - overwrite with remote content
			const existingFile = vault.getAbstractFileByPath(filePath);
			if (existingFile) {
				console.log(`Overwriting locally modified file '${filePath}' with remote content`);
				await vault.modify(existingFile, diff.remoteContent);
			} else {
				// File doesn't exist locally, create it with remote content
				await vault.create(filePath, diff.remoteContent);
			}
		} else if (diff.status === 'case-conflict-only') {
			// Handle pure case conflicts - create both files for manual resolution
			if (diff.localPath && diff.localPath !== filePath) {
				console.log(`Creating conflict files for case resolution: '${diff.localPath}' vs '${filePath}'`);
				
				// Create the remote version with conflict suffix
				const remoteConflictPath = this.generateConflictPath(filePath, 'remote');
				await vault.create(remoteConflictPath, diff.remoteContent);
				
				// Create backup of local version
				const localBackupPath = this.generateConflictPath(diff.localPath, 'local');
				const localContent = await vault.read(vault.getAbstractFileByPath(diff.localPath));
				await vault.create(localBackupPath, localContent);
				
				// Show notice to user
				new Notice(`Case conflict detected!\nRemote: ${remoteConflictPath}\nLocal backup: ${localBackupPath}\nPlease resolve manually.`, 10000);
			}
		}
	}

	findCaseInsensitiveFile(vault: any, targetPath: string) {
		// Find files that match case-insensitively
		const allFiles = vault.getAllLoadedFiles();
		const targetLower = targetPath.toLowerCase();
		
		for (const file of allFiles) {
			if (file.path.toLowerCase() === targetLower && file.path !== targetPath) {
				return file;
			}
		}
		
		return null;
	}

	generateConflictPath(originalPath: string, conflictType: string = 'conflict'): string {
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const lastDotIndex = originalPath.lastIndexOf('.');
		
		if (lastDotIndex === -1) {
			return `${originalPath}-${conflictType}-${timestamp}`;
		}
		
		const nameWithoutExt = originalPath.substring(0, lastDotIndex);
		const extension = originalPath.substring(lastDotIndex);
		return `${nameWithoutExt}-${conflictType}-${timestamp}${extension}`;
	}

	async getCurrentBranchSha(token: string, repoPath: string): Promise<string | null> {
		try {
			const response = await fetch(`https://api.github.com/repos/${repoPath}/git/ref/heads/main`, {
				headers: {
					'Authorization': `token ${token}`,
					'User-Agent': 'Obsidian-Sync-Plugin',
					'Accept': 'application/vnd.github.v3+json'
				}
			});

			if (response.ok) {
				const data = await response.json();
				return data.object.sha;
			} else if (response.status === 404) {
				// Try 'master' branch if 'main' doesn't exist
				const masterResponse = await fetch(`https://api.github.com/repos/${repoPath}/git/ref/heads/master`, {
					headers: {
						'Authorization': `token ${token}`,
						'User-Agent': 'Obsidian-Sync-Plugin',
						'Accept': 'application/vnd.github.v3+json'
					}
				});

				if (masterResponse.ok) {
					const masterData = await masterResponse.json();
					return masterData.object.sha;
				}
			}
			
			return null;
		} catch (error) {
			console.error('Error getting current branch SHA:', error);
			return null;
		}
	}

	async createBlob(token: string, repoPath: string, content: string): Promise<string> {
		// Encode content as base64
		const encoder = new TextEncoder();
		const bytes = encoder.encode(content);
		const base64Content = btoa(String.fromCharCode(...bytes));

		const response = await fetch(`https://api.github.com/repos/${repoPath}/git/blobs`, {
			method: 'POST',
			headers: {
				'Authorization': `token ${token}`,
				'User-Agent': 'Obsidian-Sync-Plugin',
				'Accept': 'application/vnd.github.v3+json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				content: base64Content,
				encoding: 'base64'
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to create blob: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		return data.sha;
	}

	async createTree(token: string, repoPath: string, baseSha: string, fileBlobs: {path: string, sha: string, mode: string}[], deletions: string[]): Promise<string> {
		// Get the current tree
		const currentTreeResponse = await fetch(`https://api.github.com/repos/${repoPath}/git/commits/${baseSha}`, {
			headers: {
				'Authorization': `token ${token}`,
				'User-Agent': 'Obsidian-Sync-Plugin',
				'Accept': 'application/vnd.github.v3+json'
			}
		});

		if (!currentTreeResponse.ok) {
			throw new Error(`Failed to get current tree: ${currentTreeResponse.status} ${currentTreeResponse.statusText}`);
		}

		const currentCommit = await currentTreeResponse.json();
		const baseTreeSha = currentCommit.tree.sha;

		// Prepare tree items
		const treeItems = fileBlobs.map(blob => ({
			path: blob.path,
			mode: blob.mode,
			type: 'blob',
			sha: blob.sha
		}));

		// Add deletions (files to remove)
		deletions.forEach(filename => {
			treeItems.push({
				path: filename,
				mode: '100644',
				type: 'blob',
				sha: null as any // null SHA means delete the file
			});
		});

		// Create new tree
		const response = await fetch(`https://api.github.com/repos/${repoPath}/git/trees`, {
			method: 'POST',
			headers: {
				'Authorization': `token ${token}`,
				'User-Agent': 'Obsidian-Sync-Plugin',
				'Accept': 'application/vnd.github.v3+json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				base_tree: baseTreeSha,
				tree: treeItems
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to create tree: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		return data.sha;
	}

	async createCommit(token: string, repoPath: string, treeSha: string, parentSha: string, processedFiles: string[]): Promise<string> {
		const commitMessage = this.generateCommitMessage(processedFiles);

		const response = await fetch(`https://api.github.com/repos/${repoPath}/git/commits`, {
			method: 'POST',
			headers: {
				'Authorization': `token ${token}`,
				'User-Agent': 'Obsidian-Sync-Plugin',
				'Accept': 'application/vnd.github.v3+json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				message: commitMessage,
				tree: treeSha,
				parents: [parentSha]
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to create commit: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		return data.sha;
	}

	async updateBranchRef(token: string, repoPath: string, commitSha: string) {
		// Try to update main branch first, then master
		const branches = ['main', 'master'];
		
		for (const branch of branches) {
			try {
				const response = await fetch(`https://api.github.com/repos/${repoPath}/git/refs/heads/${branch}`, {
					method: 'PATCH',
					headers: {
						'Authorization': `token ${token}`,
						'User-Agent': 'Obsidian-Sync-Plugin',
						'Accept': 'application/vnd.github.v3+json',
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						sha: commitSha
					})
				});

				if (response.ok) {
					console.log(`Updated ${branch} branch to ${commitSha}`);
					return; // Success
				} else if (response.status === 404) {
					// Branch doesn't exist, try next one
					continue;
				} else {
					throw new Error(`Failed to update ${branch} branch: ${response.status} ${response.statusText}`);
				}
			} catch (error) {
				console.error(`Error updating ${branch} branch:`, error);
				if (branch === branches[branches.length - 1]) {
					// Last branch attempt failed
					throw error;
				}
			}
		}

		throw new Error('Could not update any branch (tried main and master)');
	}

	generateCommitMessage(processedFiles: string[]): string {
		const deviceName = this.plugin.settings.deviceName;
		const fileCount = processedFiles.length;
		
		if (deviceName && deviceName.trim() !== '') {
			return `sync: ${deviceName} updated ${fileCount} file${fileCount === 1 ? '' : 's'}`;
		} else {
			return `sync: updated ${fileCount} file${fileCount === 1 ? '' : 's'}`;
		}
	}

	async commitLocalChanges(processedFiles: string[]) {
		try {
			const adapter = this.plugin.app.vault.adapter as any;
			const vaultPath = adapter.basePath || adapter.path || adapter.fs?.getBasePath?.() || '';
			
			if (!vaultPath) {
				console.warn('Could not determine vault path for Git operations');
				return;
			}

			// Use isomorphic-git to commit changes
			const git = require('isomorphic-git');
			const fs = this.createFileSystemInterface();

			// Stage all processed files
			for (const filePath of processedFiles) {
				await git.add({
					fs,
					dir: vaultPath,
					filepath: filePath
				});
			}

			// Commit the changes
			const commitMessage = this.generateCommitMessage(processedFiles);
			await git.commit({
				fs,
				dir: vaultPath,
				message: commitMessage,
				author: {
					name: 'Obsidian Sync',
					email: 'obsidian-sync@local'
				}
			});

		} catch (error) {
			console.warn('Could not commit local changes with Git:', error.message);
			// This is not critical - the remote changes are already pushed
		}
	}

	async getGitChangedFiles(): Promise<{file: string, status: string}[]> {
		try {
			// Try to get vault path - different approaches for desktop vs mobile
			const adapter = this.plugin.app.vault.adapter as any;
			const vaultPath = adapter.basePath || adapter.path || adapter.fs?.getBasePath?.() || '';
			
			if (!vaultPath) {
				console.warn('Could not determine vault path, falling back to full scan');
				throw new Error('Vault path not available');
			}

			// Use isomorphic-git for cross-platform compatibility (works on mobile too)
			const git = require('isomorphic-git');
			
			// Create a file system interface compatible with isomorphic-git
			const fs = this.createFileSystemInterface();

			// Get the status of all files
			const statusMatrix = await git.statusMatrix({
				fs,
				dir: vaultPath,
			});

			const changes: {file: string, status: string}[] = [];
			
			// Parse the status matrix
			// statusMatrix format: [filepath, HEADStatus, WorkdirStatus, StageStatus]
			// 0 = absent, 1 = present, 2 = modified
			for (const [filepath, HEADStatus, WorkdirStatus, StageStatus] of statusMatrix) {
				// Skip files that haven't changed
				if (HEADStatus === 1 && WorkdirStatus === 1 && StageStatus === 1) {
					continue; // File is unchanged
				}

				let status = 'M'; // Default to modified
				
				if (HEADStatus === 0 && WorkdirStatus === 1) {
					status = 'A'; // New file (untracked)
				} else if (HEADStatus === 1 && WorkdirStatus === 0) {
					status = 'D'; // Deleted
				} else if (HEADStatus === 1 && WorkdirStatus === 2) {
					status = 'M'; // Modified
				} else if (HEADStatus === 0 && StageStatus === 1) {
					status = 'A'; // Added (staged)
				} else if (HEADStatus === 1 && StageStatus === 0) {
					status = 'D'; // Deleted (staged)
				} else if (StageStatus === 2) {
					status = 'M'; // Modified (staged)
				}

				changes.push({
					file: filepath,
					status: status
				});
			}

			return changes;
		} catch (error) {
			// If isomorphic-git is not available or not a Git repository, fall back to checking all files
			console.warn('Git not available or not a Git repository, falling back to full scan:', error.message);
			
			// Fallback: return all markdown files as "modified"
			const vault = this.plugin.app.vault;
			const markdownFiles = vault.getMarkdownFiles();
			
			return markdownFiles.map(file => ({
				file: file.path,
				status: 'M'
			}));
		}
	}

	createFileSystemInterface() {
		const adapter = this.plugin.app.vault.adapter as any;
		
		return {
			promises: {
				readFile: async (filepath: string, encoding?: string) => {
					try {
						const content = await adapter.read(filepath);
						return encoding === 'utf8' ? content : Buffer.from(content, 'utf8');
					} catch (error) {
						throw new Error(`ENOENT: no such file or directory, open '${filepath}'`);
					}
				},
				writeFile: async (filepath: string, data: string | Buffer) => {
					return adapter.write(filepath, typeof data === 'string' ? data : data.toString());
				},
				readdir: async (dirpath: string) => {
					try {
						// For root directory, list all files and folders
						if (dirpath === '.' || dirpath === '') {
							const allFiles = this.plugin.app.vault.getAllLoadedFiles();
							const items = new Set<string>();
							
							allFiles.forEach(file => {
								const parts = file.path.split('/');
								if (parts.length === 1) {
									// Root level file
									items.add(file.name);
								} else {
									// Add the top-level directory
									items.add(parts[0]);
								}
							});
							
							return Array.from(items);
						} else {
							// For subdirectories, list contents
							const allFiles = this.plugin.app.vault.getAllLoadedFiles();
							const items = new Set<string>();
							
							allFiles.forEach(file => {
								if (file.path.startsWith(dirpath + '/')) {
									const relativePath = file.path.substring(dirpath.length + 1);
									const parts = relativePath.split('/');
									items.add(parts[0]);
								}
							});
							
							return Array.from(items);
						}
					} catch (error) {
						return [];
					}
				},
				stat: async (filepath: string) => {
					try {
						const file = this.plugin.app.vault.getAbstractFileByPath(filepath);
						if (!file) {
							throw new Error(`ENOENT: no such file or directory, stat '${filepath}'`);
						}
						
						return {
							isFile: () => file instanceof TFile,
							isDirectory: () => file instanceof TFolder,
							size: file instanceof TFile ? (file as TFile).stat?.size || 0 : 0,
							mode: 0o666,
							mtime: new Date((file as any).stat?.mtime || Date.now()),
							mtimeMs: (file as any).stat?.mtime || Date.now()
						};
					} catch (error) {
						throw new Error(`ENOENT: no such file or directory, stat '${filepath}'`);
					}
				},
				mkdir: async (dirpath: string) => {
					// Obsidian creates directories automatically
					return;
				},
				rmdir: async (dirpath: string) => {
					// Not implemented for safety
					return;
				},
				unlink: async (filepath: string) => {
					// Not implemented for safety
					return;
				}
			}
		};
	}

	async fetchDiffs(): Promise<any[]> {
		if (!this.plugin.settings.selectedRepository) {
			throw new Error('No repository selected');
		}

		const diffs: any[] = [];
		const vault = this.plugin.app.vault;
		const token = this.plugin.settings.githubToken;
		const repoPath = this.plugin.settings.selectedRepository;

		try {
			// Use Git to get only changed files (much faster than checking every file)
			const gitChanges = await this.getGitChangedFiles();
			
			if (gitChanges.length === 0) {
				console.log('No Git changes detected');
				return diffs;
			}

			console.log(`Git detected ${gitChanges.length} changed files, fetching remote tree...`);
			
			// Get the entire remote repository tree in ONE API call (much more efficient)
			const remoteTree = await this.fetchRemoteTree(token, repoPath);
			console.log(`Remote tree fetched with ${remoteTree.size} files and content. Comparing...`);
			
			// Check for remote changes you don't have locally
			await this.checkForRemoteChanges(vault, remoteTree, gitChanges, diffs);
			
			// Only check the files that Git says have changed locally
			for (const gitChange of gitChanges) {
				try {
					const filePath = gitChange.file;
					
					// Skip non-markdown files
					if (!filePath.endsWith('.md')) {
						continue;
					}

					// Handle different Git statuses
					if (gitChange.status === 'D') {
						// File was deleted locally - check if it exists in remote tree
						const remoteFile = remoteTree.get(filePath);
						if (remoteFile && remoteFile.content !== undefined) {
							// File was deleted locally but exists remotely
							const remoteLines = remoteFile.content.split('\n');
							
				   diffs.push({
					   filename: filePath,
					   status: 'remote-only',
					   additions: 0,
					   deletions: remoteLines.length,
					   localContent: '',
					   remoteContent: remoteFile.content,
					   sha: remoteFile.sha,
					   remoteSha: remoteFile.sha
				   });
						}
						continue;
					}

					// For modified/added files, read local content
					const localFile = vault.getAbstractFileByPath(filePath);
					if (!localFile || localFile.path !== filePath) {
						console.warn(`Local file not found: ${filePath}`);
						continue;
					}

					const localContent = await vault.read(localFile as any);
					
					// Check if file exists in remote tree
					const remoteFile = remoteTree.get(filePath);
					
					if (!remoteFile) {
						// File doesn't exist remotely - it's new
						const lines = localContent.split('\n');
						diffs.push({
							filename: filePath,
							status: 'added',
							additions: lines.length,
							deletions: 0,
							localContent,
							remoteContent: '',
							sha: ''
						});
					} else {
						// File exists remotely - check if SHA is different (quick comparison)
						const localHash = await this.calculateContentHash(localContent);
						
						if (localHash !== remoteFile.sha) {
							// SHAs are different, but we need to verify if content is actually different
							// Use pre-fetched remote content for accurate comparison
							const remoteContent = remoteFile.content || '';
							
							// Compare actual content (normalize line endings)
							const normalizedLocal = localContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
							const normalizedRemote = remoteContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
							
							if (normalizedLocal !== normalizedRemote) {
								// Content is actually different
								const localLines = normalizedLocal.split('\n');
								const remoteLines = normalizedRemote.split('\n');
								
								// Calculate proper diff stats
								const maxLines = Math.max(localLines.length, remoteLines.length);
								let additions = 0;
								let deletions = 0;
								
								for (let i = 0; i < maxLines; i++) {
									const localLine = localLines[i] || '';
									const remoteLine = remoteLines[i] || '';
									
									if (i >= remoteLines.length) {
										additions++; // New line in local
									} else if (i >= localLines.length) {
										deletions++; // Line deleted from local
									} else if (localLine !== remoteLine) {
										additions++; // Line modified (count as addition)
									}
								}

								if (additions > 0 || deletions > 0) {
									diffs.push({
										filename: filePath,
										status: 'modified',
										additions,
										deletions,
										localContent,
										remoteContent,
										sha: remoteFile.sha,
										remoteSha: remoteFile.sha
									});
								}
							}
							// If normalized content is the same, file is actually unchanged - skip it
						}
						// If SHA is the same, content is identical - no diff needed
					}
				} catch (fileError) {
					console.warn(`Error processing file ${gitChange.file}:`, fileError);
					continue;
				}
			}

			return diffs;

		} catch (error) {
			throw new Error(`Failed to fetch diffs: ${error.message}`);
		}
	}

	async checkForRemoteChanges(vault: any, remoteTree: Map<string, {sha: string, type: string, content?: string}>, gitChanges: {file: string, status: string}[], diffs: any[]) {
		// Get list of files that Git has NOT flagged as changed
		const gitChangedFiles = new Set(gitChanges.map(change => change.file));
		
		// Create maps for both exact and case-insensitive matching
		const localFilesExact = new Map<string, any>();
		const localFilesCaseInsensitive = new Map<string, any>();
		const allLocalFiles = vault.getAllLoadedFiles();
		
		allLocalFiles.forEach((file: any) => {
			localFilesExact.set(file.path, file);
			localFilesCaseInsensitive.set(file.path.toLowerCase(), file);
		});
		
		// Check all markdown files in the remote tree
		for (const [remotePath, remoteFile] of remoteTree) {
			// Skip if this file is already being processed by Git changes
			if (gitChangedFiles.has(remotePath)) {
				continue;
			}
			
			// Skip non-markdown files
			if (!remotePath.endsWith('.md')) {
				continue;
			}
			
			// Strategy: Prefer exact case match over case-insensitive match
			let localFile = localFilesExact.get(remotePath); // Try exact match first
			let matchType = 'exact';
			
			// If no exact match, try case-insensitive match
			if (!localFile) {
				const caseInsensitiveMatch = localFilesCaseInsensitive.get(remotePath.toLowerCase());
				if (caseInsensitiveMatch && caseInsensitiveMatch.path !== remotePath) {
					// Found case-insensitive match but not exact match
					localFile = caseInsensitiveMatch;
					matchType = 'case-conflict';
					console.log(`Case mismatch: remote '${remotePath}' matches local '${localFile.path}' (case-insensitive)`);
				}
			}
			
			if (!localFile) {
				// File exists remotely but not locally - treat as deleted (user wants to delete remote file)
				const remoteContent = remoteFile.content || '';
				const remoteLines = remoteContent.split('\n');

			   diffs.push({
				   filename: remotePath,
				   status: 'remote-only',
				   additions: 0,
				   deletions: remoteLines.length,
				   localContent: '',
				   remoteContent: remoteContent,
				   sha: '',
				   remoteSha: remoteFile.sha,
				   matchType: 'none'
			   });
			} else {
				// File exists both locally and remotely
				try {
					const localContent = await vault.read(localFile);
					const localHash = await this.calculateContentHash(localContent);
					
					if (localHash !== remoteFile.sha) {
						// SHAs are different - check if content is actually different
						const remoteContent = remoteFile.content || '';
						
						// Compare actual content (normalize line endings)
						const normalizedLocal = localContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
						const normalizedRemote = remoteContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
						
						if (normalizedLocal !== normalizedRemote) {
							// Remote has changes you don't have locally
							const localLines = normalizedLocal.split('\n');
							const remoteLines = normalizedRemote.split('\n');
							
							// Calculate diff stats (from local perspective)
							const maxLines = Math.max(localLines.length, remoteLines.length);
							let additions = 0;
							let deletions = 0;
							
							for (let i = 0; i < maxLines; i++) {
								const localLine = localLines[i] || '';
								const remoteLine = remoteLines[i] || '';
								
								if (i >= localLines.length) {
									additions++; // New line in remote
								} else if (i >= remoteLines.length) {
									deletions++; // Line removed in remote
								} else if (localLine !== remoteLine) {
									additions++; // Line changed in remote
								}
							}
							
							if (additions > 0 || deletions > 0) {
								diffs.push({
									filename: remotePath,
									status: 'remote-modified',
									additions,
									deletions,
									localContent,
									remoteContent,
									sha: '',
									remoteSha: remoteFile.sha,
									matchType: matchType,
									localPath: localFile.path // Store actual local path for case conflicts
								});
							}
						} else if (matchType === 'case-conflict') {
							// Content is same but case differs - mark for path normalization
							diffs.push({
								filename: remotePath,
								status: 'case-conflict-only',
								additions: 0,
								deletions: 0,
								localContent,
								remoteContent: remoteContent,
								sha: '',
								remoteSha: remoteFile.sha,
								matchType: matchType,
								localPath: localFile.path
							});
						}
					} else if (matchType === 'case-conflict') {
						// Same content but different case - need to normalize
						const remoteContent = remoteFile.content || '';
						diffs.push({
							filename: remotePath,
							status: 'case-conflict-only',
							additions: 0,
							deletions: 0,
							localContent,
							remoteContent,
							sha: '',
							remoteSha: remoteFile.sha,
							matchType: matchType,
							localPath: localFile.path
						});
					}
				} catch (error) {
					console.warn(`Error checking remote changes for ${remotePath}:`, error);
				}
			}
		}
	}

	async fetchFileContentByBlob(token: string, repoPath: string, sha: string): Promise<string> {
		try {
			// Use GitHub Blob API to fetch content by SHA
			const response = await fetch(`https://api.github.com/repos/${repoPath}/git/blobs/${sha}`, {
				headers: {
					'Authorization': `token ${token}`,
					'User-Agent': 'Obsidian-Sync-Plugin',
					'Accept': 'application/vnd.github.v3+json'
				}
			});

			if (response.ok) {
				const blobData = await response.json();
				if (blobData.encoding === 'base64') {
					// Properly decode base64 content with UTF-8 encoding
					const base64Content = blobData.content.replace(/\n/g, '');
					
					// Convert base64 to bytes, then to UTF-8 string
					const binaryString = atob(base64Content);
					const bytes = new Uint8Array(binaryString.length);
					for (let i = 0; i < binaryString.length; i++) {
						bytes[i] = binaryString.charCodeAt(i);
					}
					
					// Decode bytes as UTF-8
					const decoder = new TextDecoder('utf-8');
					return decoder.decode(bytes);
				} else {
					return blobData.content || '';
				}
			} else {
				console.warn(`Failed to fetch blob ${sha}: ${response.status} ${response.statusText}`);
				return '';
			}
		} catch (error) {
			console.warn(`Error fetching blob ${sha}:`, error);
			return '';
		}
	}

	async fetchRemoteTree(token: string, repoPath: string): Promise<Map<string, {sha: string, type: string, content?: string}>> {
		const tree = new Map<string, {sha: string, type: string, content?: string}>();
		
		try {
			// Use GitHub Trees API to get entire repository structure in one call
			const response = await fetch(`https://api.github.com/repos/${repoPath}/git/trees/HEAD?recursive=1`, {
				headers: {
					'Authorization': `token ${token}`,
					'User-Agent': 'Obsidian-Sync-Plugin',
					'Accept': 'application/vnd.github.v3+json'
				}
			});

			if (response.ok) {
				const data = await response.json();
				
				// Build a map of file paths to their SHAs
				if (data.tree) {
					// First pass: collect all markdown files
					const markdownFiles: {path: string, sha: string}[] = [];
					data.tree.forEach((item: any) => {
						if (item.type === 'blob' && item.path.endsWith('.md')) {
							tree.set(item.path, {
								sha: item.sha,
								type: item.type
							});
							markdownFiles.push({path: item.path, sha: item.sha});
						}
					});

					// Second pass: batch fetch content for all markdown files in parallel
					console.log(`Fetching content for ${markdownFiles.length} files...`);
					const contentPromises = markdownFiles.map(file => 
						this.fetchFileContentByBlob(token, repoPath, file.sha)
							.then((content: string) => ({path: file.path, content}))
							.catch((error: any) => {
								console.warn(`Failed to fetch content for ${file.path}:`, error.message);
								return {path: file.path, content: ''};
							})
					);

					const results = await Promise.all(contentPromises);
					
					// Store content in the tree map
					results.forEach((result: {path: string, content: string}) => {
						const treeItem = tree.get(result.path);
						if (treeItem) {
							treeItem.content = result.content;
						}
					});
				}
			} else if (response.status === 401) {
				throw new Error('Invalid token - authentication failed');
			} else if (response.status === 404) {
				console.warn('Repository or branch not found, assuming empty remote');
				// Return empty tree - all local files will be considered new
			} else {
				throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
			}
		} catch (error) {
			console.warn('Failed to fetch remote tree:', error.message);
			// Return empty tree as fallback
		}
		
		return tree;
	}

	async calculateContentHash(content: string): Promise<string> {
		// Calculate Git blob hash for content comparison
		// Git blob hash = SHA-1("blob " + content.length + "\0" + content)
		const header = `blob ${content.length}\0`;
		const fullContent = header + content;
		
		// Use Web Crypto API for hash calculation (works on both desktop and mobile)
		const encoder = new TextEncoder();
		const data = encoder.encode(fullContent);
		const hashBuffer = await crypto.subtle.digest('SHA-1', data);
		
		// Convert to hex string
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	}

	displayDiffs(diffs: any[]) {
		if (!this.diffContainer) return;

		this.diffContainer.empty();
		
		if (diffs.length === 0) {
			this.diffContainer.createEl('div', {
				text: 'No changes',
				cls: 'sync-no-changes'
			});
			return;
		}

		const diffsHeader = this.diffContainer.createEl('h3', { 
			text: `${diffs.length} file${diffs.length === 1 ? '' : 's'} changed`,
			cls: 'sync-diffs-header'
		});

		const diffContainer = this.diffContainer; // Store reference for type safety
		diffs.forEach(diff => {
			const diffItem = diffContainer.createEl('div', { cls: 'sync-diff-item' });
			
			// File header (clickable to expand/collapse)
			const fileHeader = diffItem.createEl('div', { cls: 'sync-diff-file-header sync-diff-expandable' });
			const expandIcon = fileHeader.createEl('span', { 
				text: '▶',
				cls: 'sync-diff-expand-icon'
			});
			fileHeader.createEl('span', { 
				text: diff.filename,
				cls: 'sync-diff-filename'
			});
			fileHeader.createEl('span', { 
				text: diff.status,
				cls: `sync-diff-status sync-diff-status-${diff.status}`
			});
			
			// Stats
			const stats = fileHeader.createEl('div', { cls: 'sync-diff-stats' });
			if (diff.additions > 0) {
				stats.createEl('span', { 
					text: `+${diff.additions}`,
					cls: 'sync-diff-additions'
				});
			}
			if (diff.deletions > 0) {
				stats.createEl('span', { 
					text: `-${diff.deletions}`,
					cls: 'sync-diff-deletions'
				});
			}

			// Diff content (initially hidden)
			const diffContent = diffItem.createEl('div', { 
				cls: 'sync-diff-content sync-diff-hidden'
			});

			// Generate and display the actual diff
			this.generateDiffView(diffContent, diff);

			// Toggle functionality
			let isExpanded = false;
			fileHeader.addEventListener('click', () => {
				isExpanded = !isExpanded;
				expandIcon.textContent = isExpanded ? '▼' : '▶';
				if (isExpanded) {
					diffContent.removeClass('sync-diff-hidden');
					diffContent.addClass('sync-diff-visible');
				} else {
					diffContent.removeClass('sync-diff-visible');
					diffContent.addClass('sync-diff-hidden');
				}
			});
		});
	}

	generateDiffView(container: HTMLElement, diff: any) {
		const diffView = container.createEl('div', { cls: 'sync-diff-view' });

		if (diff.status === 'added') {
			// Show all lines as additions (green)
			const lines = diff.localContent.split('\n');
			lines.forEach((line: string, index: number) => {
				const lineEl = diffView.createEl('div', { cls: 'sync-diff-line sync-diff-line-added' });
				lineEl.createEl('span', { text: `+${index + 1}`, cls: 'sync-diff-line-number' });
				lineEl.createEl('span', { text: `+`, cls: 'sync-diff-line-prefix' });
				lineEl.createEl('span', { text: line, cls: 'sync-diff-line-content' });
			});
		} else if (diff.status === 'remote-only') {
			// Show legend for clarity
			const legend = diffView.createEl('div', { cls: 'sync-diff-legend' });
			legend.createEl('span', { text: 'Green = will be restored locally (Pull)', cls: 'sync-diff-legend-added' });
			legend.createEl('span', { text: 'Red = will be deleted remotely (Push)', cls: 'sync-diff-legend-deleted' });

			const lines = diff.remoteContent.split('\n');
			lines.forEach((line: string, index: number) => {
				// Show both green and red lines for remote-only
				const lineElAdded = diffView.createEl('div', { cls: 'sync-diff-line sync-diff-line-added' });
				lineElAdded.createEl('span', { text: `+${index + 1}`, cls: 'sync-diff-line-number' });
				lineElAdded.createEl('span', { text: `+`, cls: 'sync-diff-line-prefix' });
				lineElAdded.createEl('span', { text: line, cls: 'sync-diff-line-content' });

				const lineElDeleted = diffView.createEl('div', { cls: 'sync-diff-line sync-diff-line-deleted' });
				lineElDeleted.createEl('span', { text: `-${index + 1}`, cls: 'sync-diff-line-number' });
				lineElDeleted.createEl('span', { text: `-`, cls: 'sync-diff-line-prefix' });
				lineElDeleted.createEl('span', { text: line, cls: 'sync-diff-line-content' });
			});
		} else if (diff.status === 'modified' || diff.status === 'remote-modified') {
			// Generate unified diff view
			this.generateUnifiedDiff(diffView, diff.remoteContent, diff.localContent);
		}
	}

	generateUnifiedDiff(container: HTMLElement, oldContent: string, newContent: string) {
		const oldLines = oldContent.split('\n');
		const newLines = newContent.split('\n');
		
		// Simple diff algorithm - can be improved with more sophisticated algorithms
		const maxLines = Math.max(oldLines.length, newLines.length);
		
		for (let i = 0; i < maxLines; i++) {
			const oldLine = i < oldLines.length ? oldLines[i] : null;
			const newLine = i < newLines.length ? newLines[i] : null;
			
			if (oldLine === null && newLine !== null) {
				// Line added
				const lineEl = container.createEl('div', { cls: 'sync-diff-line sync-diff-line-added' });
				lineEl.createEl('span', { text: `+${i + 1}`, cls: 'sync-diff-line-number' });
				lineEl.createEl('span', { text: `+`, cls: 'sync-diff-line-prefix' });
				lineEl.createEl('span', { text: newLine, cls: 'sync-diff-line-content' });
			} else if (oldLine !== null && newLine === null) {
				// Line deleted
				const lineEl = container.createEl('div', { cls: 'sync-diff-line sync-diff-line-deleted' });
				lineEl.createEl('span', { text: `${i + 1}`, cls: 'sync-diff-line-number' });
				lineEl.createEl('span', { text: `-`, cls: 'sync-diff-line-prefix' });
				lineEl.createEl('span', { text: oldLine, cls: 'sync-diff-line-content' });
			} else if (oldLine !== newLine) {
				// Line modified - show both old and new
				const oldLineEl = container.createEl('div', { cls: 'sync-diff-line sync-diff-line-deleted' });
				oldLineEl.createEl('span', { text: `${i + 1}`, cls: 'sync-diff-line-number' });
				oldLineEl.createEl('span', { text: `-`, cls: 'sync-diff-line-prefix' });
				oldLineEl.createEl('span', { text: oldLine || '', cls: 'sync-diff-line-content' });
				
				const newLineEl = container.createEl('div', { cls: 'sync-diff-line sync-diff-line-added' });
				newLineEl.createEl('span', { text: `+${i + 1}`, cls: 'sync-diff-line-number' });
				newLineEl.createEl('span', { text: `+`, cls: 'sync-diff-line-prefix' });
				newLineEl.createEl('span', { text: newLine || '', cls: 'sync-diff-line-content' });
			} else {
				// Line unchanged (show context)
				const lineEl = container.createEl('div', { cls: 'sync-diff-line sync-diff-line-context' });
				lineEl.createEl('span', { text: `${i + 1}`, cls: 'sync-diff-line-number' });
				lineEl.createEl('span', { text: ` `, cls: 'sync-diff-line-prefix' });
				lineEl.createEl('span', { text: oldLine || '', cls: 'sync-diff-line-content' });
			}
		}
	}

	async onClose() {
		// Nothing to clean up
	}
}
