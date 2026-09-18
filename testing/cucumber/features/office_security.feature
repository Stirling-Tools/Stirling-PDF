@convert @libre @security
Feature: Office conversion sanitizes flat-ODF documents

    # Regression for #7628/#7629: flat-ODF and content-renamed variants (.xml) must be sanitized by content, not extension.

    @positive @sanitize
    Scenario Outline: Flat-ODF with an external reference converts with the reference stripped
        Given I use an example file at "exampleFiles/security_flat_external<ext>" as parameter "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/file/pdf"
        Then the response status code should be 200
        And the response file should have extension ".pdf"
        And the response PDF should contain 0 embedded images

        Examples:
            | ext   |
            | .fodt |
            | .xml  |

    @positive @sanitize
    Scenario: Legitimate inline image in a flat-ODF is preserved
        Given I use an example file at "exampleFiles/security_flat_inline.fodt" as parameter "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/file/pdf"
        Then the response status code should be 200
        And the response file should have extension ".pdf"
        And the response PDF should contain 1 embedded images
