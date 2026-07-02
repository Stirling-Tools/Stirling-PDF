@security @redact
Feature: PDF redaction physically removes text
  Redaction must destroy the underlying text, not merely cover it with a box.
  These scenarios push known text through the redaction endpoints and assert the
  target is gone from the extracted text layer (and catalog carriers) while other
  text survives.

  Scenario: Auto-redact physically removes the target word
    Given I generate a PDF file as "fileInput"
    And the pdf pages all contain the text "PUBLIC alpha SECRET99 omega PUBLIC"
    And the request data includes
      | parameter  | value    |
      | listOfText | SECRET99 |
    When I send the API request to the endpoint "/api/v1/security/auto-redact"
    Then the response status code should be 200
    And the response content type should be "application/pdf"
    And the response PDF should not contain the text "SECRET99"
    And the response PDF should contain the text "omega"

  Scenario: Auto-redact leaves substrings when whole-word search is on
    Given I generate a PDF file as "fileInput"
    And the pdf pages all contain the text "cat classification scatter"
    And the request data includes
      | parameter       | value |
      | listOfText      | cat   |
      | wholeWordSearch | true  |
    When I send the API request to the endpoint "/api/v1/security/auto-redact"
    Then the response status code should be 200
    And the response PDF should contain the text "classification"
    And the response PDF should contain the text "scatter"

  Scenario: Auto-redact with a regex pattern removes matches
    Given I generate a PDF file as "fileInput"
    And the pdf pages all contain the text "call 123-45-6789 today"
    And the request data includes
      | parameter  | value             |
      | listOfText | \d{3}-\d{2}-\d{4} |
      | useRegex   | true              |
    When I send the API request to the endpoint "/api/v1/security/auto-redact"
    Then the response status code should be 200
    And the response PDF should not contain the text "123-45-6789"
    And the response PDF should contain the text "today"

  Scenario: Auto-redact convert-to-image drops the entire text layer
    Given I generate a PDF file as "fileInput"
    And the pdf pages all contain the text "keep SECRET77 hidden"
    And the request data includes
      | parameter         | value    |
      | listOfText        | SECRET77 |
      | convertPDFToImage | true     |
    When I send the API request to the endpoint "/api/v1/security/auto-redact"
    Then the response status code should be 200
    And the response PDF should not contain the text "SECRET77"
    And the response PDF should not contain the text "keep"

  Scenario: Auto-redact also scrubs the target from bookmark titles
    Given I generate a PDF file as "fileInput"
    And the pdf pages all contain the text "body SECRET55 text"
    And the pdf has a bookmark titled "Chapter SECRET55 overview"
    And the request data includes
      | parameter  | value    |
      | listOfText | SECRET55 |
    When I send the API request to the endpoint "/api/v1/security/auto-redact"
    Then the response status code should be 200
    And the response PDF should not contain the text "SECRET55"
    And the response PDF bookmarks should not contain "SECRET55"

  Scenario: Manual whole-page redaction wipes every word on the page
    Given I generate a PDF file as "fileInput"
    And the pdf pages all contain the text "TOP SECRET material"
    And the request data includes
      | parameter   | value |
      | pageNumbers | 1     |
    When I send the API request to the endpoint "/api/v1/security/redact"
    Then the response status code should be 200
    And the response PDF should not contain the text "SECRET"

  Scenario: Auto-redact removes case variants of the target
    Given I generate a PDF file as "fileInput"
    And the pdf pages all contain the text "alpha Secret99x omega"
    And the request data includes
      | parameter  | value     |
      | listOfText | SECRET99X |
    When I send the API request to the endpoint "/api/v1/security/auto-redact"
    Then the response status code should be 200
    And the response PDF should not contain the text "Secret99x"
    And the response PDF should contain the text "omega"

  Scenario: Auto-redact only touches pages containing the target
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages
    And the request data includes
      | parameter  | value  |
      | listOfText | Page 2 |
    When I send the API request to the endpoint "/api/v1/security/auto-redact"
    Then the response status code should be 200
    And the response PDF should not contain the text "Page 2"
    And the response PDF should contain the text "Page 1"
    And the response PDF should contain the text "Page 3"

  Scenario: Auto-redact handles a Type3 font PDF (glyphs as content streams)
    Given I use an example file at "../crop_test.pdf" as parameter "fileInput"
    And the request data includes
      | parameter  | value   |
      | listOfText | EXAMPLE |
    When I send the API request to the endpoint "/api/v1/security/auto-redact"
    Then the response status code should be 200
    And the response PDF should not contain the text "EXAMPLE"
    And the response PDF should contain the text "CROP"
