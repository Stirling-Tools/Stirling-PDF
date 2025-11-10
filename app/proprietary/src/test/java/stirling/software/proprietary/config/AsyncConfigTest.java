package stirling.software.proprietary.config;

import static org.junit.jupiter.api.Assertions.*;

import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class AsyncConfigTest {

    private final AsyncConfig asyncConfig = new AsyncConfig();

    @Test
    void auditExecutorIsConfiguredWithMdcTaskDecorator() throws Exception {
        Executor executor = asyncConfig.auditExecutor();
        assertInstanceOf(ThreadPoolTaskExecutor.class, executor);
        ThreadPoolTaskExecutor taskExecutor = (ThreadPoolTaskExecutor) executor;

        assertEquals(2, taskExecutor.getCorePoolSize());
        assertEquals(8, taskExecutor.getMaxPoolSize());
        assertEquals("audit-", taskExecutor.getThreadNamePrefix());
        assertEquals(1000, taskExecutor.getThreadPoolExecutor().getQueue().remainingCapacity());

        AtomicReference<String> captured = new AtomicReference<>();
        MDC.put("traceId", "executor-test");
        taskExecutor.submit(() -> captured.set(MDC.get("traceId")));
        MDC.clear();

        taskExecutor.shutdown();
        assertTrue(taskExecutor.getThreadPoolExecutor().awaitTermination(5, TimeUnit.SECONDS));
        assertEquals("executor-test", captured.get());
    }

    @Test
    void mdcContextTaskDecoratorPropagatesContextAndCleansUp() {
        MDC.put("traceId", "abc123");
        AsyncConfig.MDCContextTaskDecorator decorator = new AsyncConfig.MDCContextTaskDecorator();
        AtomicReference<String> capturedValue = new AtomicReference<>();

        Runnable decorated = decorator.decorate(() -> capturedValue.set(MDC.get("traceId")));

        MDC.clear();
        decorated.run();

        assertEquals("abc123", capturedValue.get());
        assertNull(MDC.get("traceId"));
    }
}
