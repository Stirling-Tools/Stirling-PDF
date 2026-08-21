@folders @storage
Feature: Server-side folders and file placement
  Verify the Phase A folder REST API and the file-folder placement
  endpoint introduced alongside the new files page UI.

  All folder endpoints require authentication. Each scenario starts
  from a clean folder list so leftover state from previous runs cannot
  trip the folder-cap or naming assertions.

  Background:
    Given I am logged in as admin
    And I clear all my folders


  # =========================================================================
  # Folder CRUD
  # =========================================================================

  @positive @create
  Scenario: Create a root folder
    When I POST a folder with name "Invoices"
    Then the response status code should be 201
    And the response JSON folder should have name "Invoices"
    And the response JSON folder.parentFolderId should be null
    And the response JSON folder.createdAt should not be empty

  @negative @create
  Scenario: Cannot create a folder with a blank name
    When I POST a folder with name " "
    Then the response status code should be 400

  @negative @create
  Scenario: Cannot create a folder with an over-long name
    When I POST a folder with a 256-character name
    Then the response status code should be 400

  @positive @rename
  Scenario: Rename a folder
    Given a folder "Old" exists
    When I PATCH folder "Old" with name "New"
    Then the response status code should be 200
    And the response JSON folder should have name "New"

  @negative @rename
  Scenario: Renaming to a blank name is rejected
    Given a folder "Keep" exists
    When I PATCH folder "Keep" with name " "
    Then the response status code should be 400

  @positive @move
  Scenario: Move a folder under a parent
    Given a folder "Parent" exists
    And a folder "Child" exists
    When I PATCH folder "Child" with parentFolderId = "Parent.id"
    Then the response status code should be 200
    And the response JSON folder.parentFolderId should equal "Parent.id"

  @positive @move
  Scenario: Move a folder back to root by reparenting to null
    Given a folder "Parent" exists
    And a folder "Child" exists under "Parent"
    When I PATCH folder "Child" with parentFolderId = "null"
    Then the response status code should be 200
    And the response JSON folder.parentFolderId should be null

  @negative @cycle
  Scenario: Self-parent is rejected
    Given a folder "X" exists
    When I PATCH folder "X" with parentFolderId = "X.id"
    Then the response status code should be 400

  @negative @cycle
  Scenario: Moving a folder into its own subtree is rejected
    Given a folder "A" exists
    And a folder "B" exists under "A"
    When I PATCH folder "A" with parentFolderId = "B.id"
    Then the response status code should be 400

  @positive @delete
  Scenario: Deleting a folder cascades the subtree
    Given a folder "Root" exists
    And a folder "Child" exists under "Root"
    When I DELETE folder "Root"
    Then the response status code should be 200
    When I list folders
    Then the folder list should not contain "Root"
    And the folder list should not contain "Child"

  @positive @list
  Scenario: List returns all my folders
    Given a folder "Alpha" exists
    And a folder "Beta" exists
    When I list folders
    Then the response status code should be 200
    And the folder list should contain "Alpha"
    And the folder list should contain "Beta"


  # =========================================================================
  # File - folder placement
  # =========================================================================

  @positive @file-placement
  Scenario: Uploading a file lands at root by default
    Given I upload a file as "sample.pdf"
    Then the response status code should be 200
    And the response JSON file.folderId should be null

  @positive @file-placement
  Scenario: Move a file into a folder
    Given a folder "Target" exists
    And I upload a file as "report.pdf"
    When I PATCH file "report.pdf" with folderId = "Target.id"
    Then the response status code should be 204

  @positive @file-placement
  Scenario: Move a file back to root via folderId = null
    Given a folder "Target" exists
    And I upload a file as "doc.pdf"
    And I PATCH file "doc.pdf" with folderId = "Target.id"
    When I PATCH file "doc.pdf" with folderId = "null"
    Then the response status code should be 204

  @positive @delete
  Scenario: Deleting a folder reparents its files to root, never deletes them
    Given a folder "Project" exists
    And I upload a file as "kept.pdf"
    And I PATCH file "kept.pdf" with folderId = "Project.id"
    When I DELETE folder "Project"
    Then the response status code should be 200
    When I list files
    Then the file list should contain a file named "kept.pdf" with folderId null


  # =========================================================================
  # Authentication
  # =========================================================================

  @negative @auth
  Scenario: Folder list rejects unauthenticated requests
    When I GET the folder list with no authentication
    Then the response status code should be one of "401,403"

  @negative @auth
  Scenario: Folder create rejects unauthenticated requests
    When I POST a folder named "Sneak" with no authentication
    Then the response status code should be one of "401,403"
