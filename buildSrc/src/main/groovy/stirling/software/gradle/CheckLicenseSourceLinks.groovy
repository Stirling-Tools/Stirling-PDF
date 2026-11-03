package stirling.software.gradle

import groovy.json.JsonSlurper
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.TaskAction

/** Fails when a dependency's source link is missing or no longer loads. Needs network access. */
abstract class CheckLicenseSourceLinks extends DefaultTask {
    private static final Duration TIMEOUT = Duration.ofSeconds(30)

    @InputFile
    abstract RegularFileProperty getReportFile()

    @InputFile
    abstract RegularFileProperty getSelectionsFile()

    CheckLicenseSourceLinks() {
        outputs.upToDateWhen { false }
    }

    @TaskAction
    void check() {
        Map report = new JsonSlurper().parse(reportFile.get().asFile) as Map
        Map selections = new JsonSlurper().parse(selectionsFile.get().asFile) as Map
        HttpClient client = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(TIMEOUT)
                .build()

        List<String> problems = LicenseSourceLinks.problems(
                report.dependencies as List<Map<String, String>>,
                selections as Map<String, Map<String, String>>) { url -> statusOf(client, url) }
        if (!problems.isEmpty()) {
            throw new GradleException(
                    "License source links need attention:\n  " + problems.join('\n  '))
        }
    }

    protected Integer statusOf(HttpClient client, String url) {
        try {
            HttpRequest head = HttpRequest.newBuilder(URI.create(url))
                    .method('HEAD', HttpRequest.BodyPublishers.noBody())
                    .timeout(TIMEOUT)
                    .build()
            int status = client.send(head, HttpResponse.BodyHandlers.discarding()).statusCode()
            if (status != 405) {
                return status
            }
            HttpRequest get = HttpRequest.newBuilder(URI.create(url)).timeout(TIMEOUT).build()
            return client.send(get, HttpResponse.BodyHandlers.discarding()).statusCode()
        } catch (IOException | IllegalArgumentException e) {
            logger.warn("Could not reach ${url}: ${e.message}")
            return null
        }
    }
}
