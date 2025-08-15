Feature: File Synchronization
  As a user with a selected repository
  I want to sync my notes between local vault and GitHub
  So that my notes are backed up and available across devices

  Background:
    Given the Kolaba plugin is loaded
    And I am authenticated with GitHub
    And I have selected a repository
    And the sync view is open

  Scenario: Syncing with no changes
    Given my local vault is in sync with the remote repository
    When I click the "Sync" button
    Then I should see "Syncing..." while processing
    And I should see "No changes" in the diff container
    And the pull and push buttons should be disabled

  Scenario: Detecting local file additions
    Given I have created new markdown files locally
    And these files don't exist in the remote repository
    When I click the "Sync" button
    Then I should see the new files marked as "added"
    And I should see the correct addition count for each file
    And the push button should be enabled
    And the pull button should be disabled

  Scenario: Detecting local file modifications
    Given I have modified existing markdown files locally
    And these files exist in the remote repository
    When I click the "Sync" button
    Then I should see the modified files marked as "modified"
    And I should see the correct addition and deletion counts
    And the push button should be enabled

  Scenario: Detecting remote file modifications
    Given files have been modified in the remote repository
    And I have not modified these files locally
    When I click the "Sync" button
    Then I should see the files marked as "remote-modified"
    And I should see the remote changes
    And the pull button should be enabled

  Scenario: Detecting remote-only files
    Given files exist in the remote repository
    And these files don't exist in my local vault
    When I click the "Sync" button
    Then I should see the files marked as "remote-only"
    And the pull button should be enabled to restore them
    And the push button should be enabled to delete them remotely

  Scenario: Handling case conflicts
    Given I have a file "Note.md" locally
    And the remote repository has "note.md" (different case)
    When I click the "Sync" button
    Then I should see the file marked as "case-conflict-only"
    And I should be prompted to resolve the case conflict manually

  Scenario: Pulling remote-only files
    Given files exist in the remote repository
    And these files don't exist in my local vault
    When I click the "Sync" button
    And I click the "Pull" button
    Then I should see "Pulling..." while processing
    And the remote-only files should be created in my local vault
    And I should see a success notice "Successfully pulled <count> files"
    And the local files should be committed with Git

  Scenario: Successful pull operation
    Given I have detected remote changes
    And the pull button is enabled
    When I click the "Pull" button
    Then I should see "Pulling..." while processing
    And the remote changes should be applied to my local files
    And I should see a success notice "Successfully pulled <count> files"
    And the local files should be committed with Git

  Scenario: Successful push operation
    Given I have local changes to push
    And the push button is enabled
    When I click the "Push" button
    Then I should see "Pushing..." while processing
    And my local changes should be uploaded to the remote repository
    And I should see a success notice "Successfully pushed <count> files"
    And the changes should be committed to the remote repository

  Scenario: Sync error handling
    Given I have network connectivity issues
    When I click the "Sync" button
    Then I should see an error message in the diff container
    And the sync button should be re-enabled
    And the pull and push buttons should remain disabled

  Scenario: Device name in commit messages
    Given I have configured a device name "laptop"
    And I have local changes to push
    When I push the changes
    Then the commit message should include "sync: laptop updated <count> files"

  Scenario: Commit message without device name
    Given I have not configured a device name
    And I have local changes to push
    When I push the changes
    Then the commit message should be "sync: updated <count> files"
