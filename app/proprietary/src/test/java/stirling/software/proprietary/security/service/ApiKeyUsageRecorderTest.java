package stirling.software.proprietary.security.service;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Unit tests for the increment/insert/increment race protocol. {@code @Async} has no proxy in a
 * plain Mockito test, so {@code record()} runs inline and is directly testable.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("ApiKeyUsageRecorder")
class ApiKeyUsageRecorderTest {

    private static final long KEY = 7L;

    @Mock private ApiKeyUsageWriter writer;
    @InjectMocks private ApiKeyUsageRecorder recorder;

    @Test
    @DisplayName("a null key id is a no-op")
    void nullIdIsNoOp() {
        recorder.record(null);
        verifyNoInteractions(writer);
    }

    @Test
    @DisplayName("row already exists: one increment, never inserts")
    void rowExistsFastPath() {
        when(writer.increment(eq(KEY), anyLong())).thenReturn(1);

        recorder.record(KEY);

        verify(writer, times(1)).increment(eq(KEY), anyLong());
        verify(writer, never()).tryInsertFirstUse(anyLong(), anyLong());
        verify(writer).stampLastUsed(KEY);
    }

    @Test
    @DisplayName("first writer of the day: increment misses, insert wins, no second increment")
    void firstWriterInserts() {
        when(writer.increment(eq(KEY), anyLong())).thenReturn(0);
        when(writer.tryInsertFirstUse(eq(KEY), anyLong())).thenReturn(true);

        recorder.record(KEY);

        verify(writer, times(1)).increment(eq(KEY), anyLong());
        verify(writer).tryInsertFirstUse(eq(KEY), anyLong());
        verify(writer).stampLastUsed(KEY);
    }

    @Test
    @DisplayName(
            "lost the insert race: falls back to a second increment so the count is not dropped")
    void lostInsertRaceReincrements() {
        when(writer.increment(eq(KEY), anyLong())).thenReturn(0);
        when(writer.tryInsertFirstUse(eq(KEY), anyLong())).thenReturn(false);

        recorder.record(KEY);

        verify(writer, times(2)).increment(eq(KEY), anyLong());
        verify(writer).stampLastUsed(KEY);
    }

    @Test
    @DisplayName("insert throws (rollback-only commit): still re-increments, count not dropped")
    void insertThrowsStillReincrements() {
        when(writer.increment(eq(KEY), anyLong())).thenReturn(0);
        when(writer.tryInsertFirstUse(eq(KEY), anyLong()))
                .thenThrow(new RuntimeException("UnexpectedRollbackException"));

        recorder.record(KEY);

        verify(writer, times(2)).increment(eq(KEY), anyLong());
        verify(writer).stampLastUsed(KEY);
    }
}
