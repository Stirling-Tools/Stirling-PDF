@jobs
Feature: Asynchronous job API

    # Any tool endpoint accepts ?async=true and returns a jobId instead of the file.
    # No parallel step here: every step after the submit depends on that one jobId.

    @positive
    Scenario: An async job runs to completion and returns its result
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter | value |
            | angle     | 90    |
        When I send the API request to the endpoint "/api/v1/general/rotate-pdf?async=true"
        Then the response status code should be 200
        And the response JSON field "async" should be true

        When I store the job id from the response
        And I wait for the job to complete
        Then the job should be reported complete

        When I request the job result
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response PDF should contain 3 pages


    @positive
    Scenario: Async job results are listed and downloadable as individual files
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages
        And the request data includes
            | parameter   | value |
            | pageNumbers | all   |
        When I send the API request to the endpoint "/api/v1/general/split-pages?async=true"
        Then the response status code should be 200

        When I store the job id from the response
        And I wait for the job to complete
        And I request the job result file list
        Then the response status code should be 200
        And the job result file list should contain at least 4 file(s)

        When I request the first job result file metadata
        Then the response status code should be 200
        And the response JSON field "fileName" should not be empty

        When I download the first job result file
        Then the response status code should be 200
        And the response file should have size greater than 100


    @negative
    Scenario: Cancelling an already-finished job is rejected
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter | value |
            | angle     | 180   |
        When I send the API request to the endpoint "/api/v1/general/rotate-pdf?async=true"
        And I store the job id from the response
        And I wait for the job to complete
        And I cancel the job
        Then the response status code should be 400


    @negative
    Scenario: Polling a job id the caller does not own is forbidden
        When I send a GET request to "/api/v1/general/job/does-not-exist-1234"
        Then the response status code should be 403


    @negative
    Scenario: Downloading an unknown file id is rejected
        When I send a GET request to "/api/v1/general/files/does-not-exist-1234"
        Then the response status code should be 404


    # An async submit persists a copy of the upload and its results under the server's
    # file store. Those outlive the request by design, so the only proof they are not a
    # leak is that cleanup actually removes them. These scenarios exercise that, and
    # environment.after_all sweeps the rest so the post-run temp-file diff stays honest.

    @positive @cleanup
    Scenario: Downloading a result does not consume it
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter | value |
            | angle     | 90    |
        When I send the API request to the endpoint "/api/v1/general/rotate-pdf?async=true"
        And I store the job id from the response
        And I wait for the job to complete
        And I request the job result file list
        Then the response status code should be 200

        When I download the first job result file
        Then the response status code should be 200
        And the response file should have size greater than 100
        # A download is a read, not a take: the file survives for a retry or a second client.
        And the job result file should still be downloadable


    @positive @cleanup
    Scenario: Cleanup releases a finished job and deletes its stored files
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter   | value |
            | pageNumbers | all   |
        When I send the API request to the endpoint "/api/v1/general/split-pages?async=true"
        And I store the job id from the response
        And I wait for the job to complete
        And I request the job result file list
        Then the response status code should be 200
        And the job result file list should contain at least 3 file(s)

        When I trigger the async job cleanup
        Then the response status code should be 200
        # 3 split results plus the persisted copy of the upload.
        And the cleanup should report at least 1 job(s) removed
        And the cleanup should report at least 4 file(s) deleted
        And the job should no longer exist
        And the job result file should no longer be downloadable


    @positive @cleanup
    Scenario: A second cleanup finds nothing left behind
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter | value |
            | angle     | 180   |
        When I send the API request to the endpoint "/api/v1/general/rotate-pdf?async=true"
        And I store the job id from the response
        And I wait for the job to complete
        And I trigger the async job cleanup
        Then the response status code should be 200
        And the cleanup should report at least 1 job(s) removed

        When I trigger the async job cleanup
        Then the response status code should be 200
        And the cleanup should report nothing left to remove
