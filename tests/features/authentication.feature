Feature: GitHub Authentication
  As a user
  I want to authenticate with GitHub
  So that I can sync my notes with a GitHub repository

  Background:
    Given the Kolaba plugin is loaded
    And the settings tab is open

  Scenario: Successful authentication with valid token
    Given I have a valid GitHub personal access token
    When I enter my GitHub token in the settings
    And I click the "Log in" button
    Then I should see a success message "✅ Successfully authenticated as <username>"
    And my GitHub username should be displayed
    And the repositories section should be available

  Scenario: Failed authentication with invalid token
    Given I have an invalid GitHub personal access token
    When I enter my GitHub token in the settings
    And I click the "Log in" button
    Then I should see an error message "❌ Invalid token - authentication failed"
    And my GitHub username should not be displayed
    And the repositories section should not be available

  Scenario: Failed authentication with empty token
    Given I have no GitHub token
    When I leave the GitHub token field empty
    And I click the "Log in" button
    Then I should see an error message "Please provide a GitHub token"

  Scenario: Re-authentication with different token
    Given I am already authenticated with GitHub
    And I have a different valid GitHub token
    When I enter the new GitHub token in the settings
    And I click the "Re login" button
    Then I should see a success message with the new username
    And my repositories list should be cleared
    And my selected repository should be cleared

  Scenario: Network error during authentication
    Given I have a valid GitHub token
    And GitHub API is not accessible
    When I enter my GitHub token in the settings
    And I click the "Log in" button
    Then I should see an error message starting with "❌ Network error:"
