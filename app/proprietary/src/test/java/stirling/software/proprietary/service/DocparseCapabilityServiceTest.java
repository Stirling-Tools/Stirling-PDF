package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.json.JsonMapper;

class DocparseCapabilityServiceTest {

    @Test
    void concurrentForcedRefreshesCannotPublishOutOfOrder() throws Exception {
        AiEngineClient client = mock(AiEngineClient.class);
        ApplicationProperties properties = new ApplicationProperties();
        properties.getAiEngine().setEnabled(true);
        CountDownLatch firstFetchStarted = new CountDownLatch(1);
        CountDownLatch releaseFirstFetch = new CountDownLatch(1);
        CountDownLatch secondRefreshStarted = new CountDownLatch(1);
        CountDownLatch secondFetchStarted = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger calls =
                new java.util.concurrent.atomic.AtomicInteger();
        when(client.get(eq("/api/v1/docparse/capabilities"), any()))
                .thenAnswer(
                        ignored -> {
                            if (calls.incrementAndGet() == 1) {
                                firstFetchStarted.countDown();
                                assertTrue(releaseFirstFetch.await(5, TimeUnit.SECONDS));
                            } else {
                                secondFetchStarted.countDown();
                            }
                            return "{\"advancedInstalled\":false,\"modelsAvailable\":false}";
                        });
        DocparseCapabilityService service =
                new DocparseCapabilityService(client, properties, JsonMapper.builder().build());

        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> first = executor.submit(() -> service.refresh(true));
            assertTrue(firstFetchStarted.await(5, TimeUnit.SECONDS));
            Future<?> second =
                    executor.submit(
                            () -> {
                                secondRefreshStarted.countDown();
                                service.refresh(true);
                            });
            assertTrue(secondRefreshStarted.await(5, TimeUnit.SECONDS));
            assertFalse(secondFetchStarted.await(200, TimeUnit.MILLISECONDS));

            releaseFirstFetch.countDown();
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
            assertTrue(secondFetchStarted.await(5, TimeUnit.SECONDS));
        } finally {
            releaseFirstFetch.countDown();
        }
    }
}
