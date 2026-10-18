package stirling.software.proprietary.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.common.cluster.inprocess.InProcessJobStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.tools.McpResponses;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpJobsTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final ApplicationProperties props = new ApplicationProperties();

    @SuppressWarnings("unchecked")
    private final McpJobs jobs =
            new McpJobs(new InProcessJobStore(), mock(ObjectProvider.class), mapper, props);

    @AfterEach
    void stop() {
        jobs.shutdown();
    }

    @Test
    void fastWork_returnsItsResultDirectly() {
        ObjectNode result =
                jobs.run("rotate-pdf", "alice", () -> McpResponses.text(mapper, "done"));

        assertEquals("done", result.get("content").get(0).get("text").asText());
    }

    @Test
    void slowWork_becomesAJobTheOwnerCanPoll() throws Exception {
        props.getMcp().setSyncWaitSeconds(1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch finished = new CountDownLatch(1);

        ObjectNode pending =
                jobs.run(
                        "ocr-pdf",
                        "alice",
                        () -> {
                            await(release);
                            ObjectNode done = McpResponses.text(mapper, "ocr done");
                            finished.countDown();
                            return done;
                        });

        assertEquals("pending", pending.get("structuredContent").get("kind").asText());
        String jobId = pending.get("structuredContent").get("jobId").asText();
        assertEquals(
                "pending",
                jobs.status(jobId, "alice").get("structuredContent").get("kind").asText());
        assertTrue(
                jobs.status(jobId, "mallory").get("isError").asBoolean(),
                "other users see nothing");

        release.countDown();
        finished.await(5, TimeUnit.SECONDS);
        ObjectNode done = waitForCompletion(jobId);
        assertEquals("ocr done", done.get("content").get(0).get("text").asText());
    }

    @Test
    void unknownJobIds_areRefused() {
        assertTrue(jobs.status("mcp-nope", "alice").get("isError").asBoolean());
        assertTrue(jobs.status("not-ours", "alice").get("isError").asBoolean());
    }

    private ObjectNode waitForCompletion(String jobId) throws InterruptedException {
        for (int i = 0; i < 50; i++) {
            ObjectNode status = jobs.status(jobId, "alice");
            if (!status.has("structuredContent")) {
                return status;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("job never completed");
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
