Feature: Repository Management
  As an authenticated user
  I want to manage GitHub repositories
  So that I can select which repository to sync my notes with

  Background:
    Given the Kolaba plugin is loaded
    And I am authenticated with GitHub
    And the settings tab is open

  Scenario: Fetching repositories successfully
    Given I have access to GitHub repositories
    When I click the "Fetch repositories" button
    Then I should see a loading state "Loading..."
    And I should receive a list of my repositories
    And I should see a success notice "Found <count> repositories"
    And the repository dropdown should be populated with my repositories

  Scenario: Refreshing repositories list
    Given I have already fetched my repositories
    When I click the "Refresh repositories" button
    Then the repositories list should be updated
    And my selected repository should be cleared
    And I should see an updated count notice

  Scenario: Selecting a repository from dropdown
    Given I have fetched my repositories
    And the repository dropdown is populated
    When I select a repository from the dropdown
    Then the selected repository should be saved in settings
    And the selected repository should be displayed
    And the sync view should show the selected repository

  Scenario: Repository access error
    Given my GitHub token has limited permissions
    When I click the "Fetch repositories" button
    Then I should see an error message about repository access
    And the repositories list should remain empty

  Scenario: No repositories found
    Given I am authenticated with GitHub
    And I have no repositories in my account
    When I click the "Fetch repositories" button
    Then I should see a notice "Found 0 repositories"
    And the repository dropdown should show no options

  Scenario: Repository dropdown interaction
    Given I have repositories available
    And I have not selected a repository yet
    When I open the repository dropdown
    Then I should see "-- Select a repository --" as the first option
    And I should see all my repositories as options
    And no repository should be pre-selected
