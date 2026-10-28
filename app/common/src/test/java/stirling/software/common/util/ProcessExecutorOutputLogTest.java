package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;
import org.mockito.Mockito;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

class ProcessExecutorOutputLogTest {

    private static final int PRINTED_LINES = 5_000;

    private final Logger logger = (Logger) LoggerFactory.getLogger(ProcessExecutor.class);
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private Level previousLevel;

    @BeforeEach
    void captureLog() {
        previousLevel = logger.getLevel();
        logger.setLevel(Level.DEBUG);
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void releaseLog() {
        logger.detachAppender(appender);
        logger.setLevel(previousLevel);
    }

    private static String lines(int count) {
        return IntStream.range(0, count)
                .mapToObj(i -> "line " + i)
                .collect(Collectors.joining("\n", "", "\n"));
    }

    /** Stands in for a tool that prints {@code stdout} and {@code stderr} and exits. */
    private static MockedConstruction<ProcessBuilder> tool(
            int exitCode, String stdout, String stderr) {
        return Mockito.mockConstruction(
                ProcessBuilder.class,
                (builder, context) -> {
                    Process process = mock(Process.class);
                    when(process.getInputStream())
                            .thenReturn(
                                    new ByteArrayInputStream(
                                            stdout.getBytes(StandardCharsets.UTF_8)));
                    when(process.getErrorStream())
                            .thenReturn(
                                    new ByteArrayInputStream(
                                            stderr.getBytes(StandardCharsets.UTF_8)));
                    when(process.waitFor(anyLong(), any(TimeUnit.class))).thenReturn(true);
                    when(process.exitValue()).thenReturn(exitCode);
                    when(process.descendants()).thenAnswer(invocation -> Stream.empty());
                    when(builder.environment()).thenReturn(new HashMap<>());
                    when(builder.start()).thenReturn(process);
                });
    }

    private int loggedOutputLines() {
        return appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .filter(message -> !message.startsWith("Running command"))
                .mapToInt(message -> message.split("\n", -1).length)
                .sum();
    }

    @Test
    void longOutputIsLoggedInPart() throws Exception {
        try (MockedConstruction<ProcessBuilder> ignored = tool(0, lines(PRINTED_LINES), "")) {
            ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                    .runCommandWithOutputHandling(List.of("gs", "-v"));
        }

        assertThat(loggedOutputLines()).isLessThanOrEqualTo(ProcessExecutor.MAX_LOGGED_LINES + 2);
        assertThat(appender.list)
                .extracting(ILoggingEvent::getFormattedMessage)
                .anyMatch(message -> message.contains("more"));
    }

    @Test
    void failureMessageCarriesPartOfTheErrorOutput() {
        try (MockedConstruction<ProcessBuilder> ignored = tool(1, "", lines(PRINTED_LINES))) {
            assertThatThrownBy(
                            () ->
                                    ProcessExecutor.getInstance(
                                                    ProcessExecutor.Processes.GHOSTSCRIPT)
                                            .runCommandWithOutputHandling(List.of("gs", "-v")))
                    .isInstanceOf(IOException.class)
                    .satisfies(
                            e ->
                                    assertThat(e.getMessage().split("\n", -1))
                                            .hasSizeLessThanOrEqualTo(
                                                    ProcessExecutor.MAX_LOGGED_LINES + 1))
                    .hasMessageContaining("line 0")
                    .hasMessageContaining(
                            (PRINTED_LINES - ProcessExecutor.MAX_LOGGED_LINES) + " more lines");
        }
    }

    @Test
    void loggedLineIsShortAndPrintable() {
        String coloured = "\u001b[31mred\u001b[0m\ttabbed";
        assertThat(ProcessExecutor.forLog(coloured)).isEqualTo("?[31mred?[0m\ttabbed");

        String longLine = "x".repeat(ProcessExecutor.MAX_LOGGED_LINE_LENGTH * 3);
        assertThat(ProcessExecutor.forLog(longLine))
                .hasSize(ProcessExecutor.MAX_LOGGED_LINE_LENGTH + 3)
                .endsWith("...");
    }
}
