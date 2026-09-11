package stirling.software.proprietary.policy.legacy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/** Tests for {@link JpaImportedPipelines}: a lost marker must never be invisible. */
class JpaImportedPipelinesTest {

    private final ImportedPipelineRepository repository = mock(ImportedPipelineRepository.class);
    private final JpaImportedPipelines pipelines = new JpaImportedPipelines(repository);

    private ListAppender<ILoggingEvent> appender;
    private Logger logger;

    @BeforeEach
    void attachLogCapture() {
        logger = (Logger) LoggerFactory.getLogger(JpaImportedPipelines.class);
        appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void detachLogCapture() {
        logger.detachAppender(appender);
        appender.stop();
    }

    @Test
    void reportsAMarkerThatCouldNotBeRecorded() {
        when(repository.save(any())).thenThrow(new DataIntegrityViolationException("too long"));
        when(repository.existsById("watched-folder:abc")).thenReturn(false);

        pipelines.markImported("watched-folder:abc");

        // Without the marker the folder is converted again on every boot.
        List<ILoggingEvent> errors =
                appender.list.stream().filter(event -> event.getLevel() == Level.ERROR).toList();
        assertEquals(1, errors.size());
        assertTrue(errors.get(0).getFormattedMessage().contains("watched-folder:abc"));
    }

    @Test
    void staysQuietWhenAConcurrentBootRecordedTheMarker() {
        when(repository.save(any())).thenThrow(new DataIntegrityViolationException("duplicate"));
        when(repository.existsById("watched-folder:abc")).thenReturn(true);

        pipelines.markImported("watched-folder:abc");

        assertTrue(appender.list.stream().noneMatch(event -> event.getLevel() == Level.ERROR));
    }
}
