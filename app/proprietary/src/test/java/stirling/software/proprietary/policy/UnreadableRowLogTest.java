package stirling.software.proprietary.policy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

class UnreadableRowLogTest {

    private Logger logger;
    private ListAppender<ILoggingEvent> appender;
    private UnreadableRowLog rows;

    @BeforeEach
    void setUp() {
        logger = (Logger) LoggerFactory.getLogger(UnreadableRowLogTest.class);
        logger.setLevel(Level.DEBUG);
        appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        rows = new UnreadableRowLog(logger, "policy");
    }

    @AfterEach
    void tearDown() {
        logger.detachAppender(appender);
    }

    @Test
    void aRowThatStaysUnreadableIsAnErrorOnlyOnce() {
        for (int read = 0; read < 3; read++) {
            rows.skipped("p1", "Security", "U6bfuXYZ==", new RuntimeException("bad token"));
        }

        assertEquals(List.of(Level.ERROR, Level.DEBUG, Level.DEBUG), levels());
    }

    @Test
    void ciphertextIsReportedAsAKeyMismatchNotAParseError() {
        rows.skipped("p1", "Security", "U6bfuXYZ==", new RuntimeException("Unrecognized token"));

        String message = appender.list.get(0).getFormattedMessage();
        assertTrue(message.contains("encrypted with a key this server does not hold"), message);
        assertTrue(!message.contains("Unrecognized token"), message);
    }

    @Test
    void malformedJsonKeepsTheParserDetail() {
        rows.skipped("p1", "Security", "{\"name\":", new RuntimeException("Unexpected end"));

        String message = appender.list.get(0).getFormattedMessage();
        assertTrue(message.contains("Unexpected end"), message);
    }

    @Test
    void aRowThatRecoversAndBreaksAgainIsAnErrorAgain() {
        rows.skipped("p1", "Security", "U6bfuXYZ==", new RuntimeException("x"));
        rows.readable("p1");
        rows.skipped("p1", "Security", "U6bfuXYZ==", new RuntimeException("x"));

        assertEquals(List.of(Level.ERROR, Level.ERROR), levels());
    }

    @Test
    void aRewrittenRowThatIsStillUnreadableIsAnErrorAgain() {
        rows.skipped("p1", "Security", "U6bfuXYZ==", new RuntimeException("x"));
        rows.skipped("p1", "Security", "Q9zzzABC==", new RuntimeException("x"));

        assertEquals(List.of(Level.ERROR, Level.ERROR), levels());
    }

    @Test
    void eachRowIsReportedOnItsOwn() {
        rows.skipped("p1", "A", "U6bfuXYZ==", new RuntimeException("x"));
        rows.skipped("p2", "B", "U6bfuXYZ==", new RuntimeException("x"));

        assertEquals(List.of(Level.ERROR, Level.ERROR), levels());
    }

    private List<Level> levels() {
        return appender.list.stream().map(ILoggingEvent::getLevel).toList();
    }
}
