package stirling.software.SPDF.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.util.TempFile;

class PipelineResultTest {

    @Nested
    @DisplayName("scalar accessors")
    class Accessors {

        @Test
        @DisplayName("output files, error flag and filter flag round-trip")
        void roundTrip() {
            PipelineResult result = new PipelineResult();
            List<Resource> files = List.of(new ByteArrayResource("a".getBytes()));
            result.setOutputFiles(files);
            result.setHasErrors(true);
            result.setFiltersApplied(true);

            assertThat(result.getOutputFiles()).isEqualTo(files);
            assertThat(result.isHasErrors()).isTrue();
            assertThat(result.isFiltersApplied()).isTrue();
        }

        @Test
        @DisplayName("temp files list starts empty")
        void tempFilesEmptyByDefault() {
            assertThat(new PipelineResult().getTempFiles()).isEmpty();
        }
    }

    @Nested
    @DisplayName("temp file lifecycle")
    class Lifecycle {

        @Test
        @DisplayName("addTempFile stores the file")
        void addTempFile() {
            PipelineResult result = new PipelineResult();
            TempFile tempFile = mock(TempFile.class);
            when(tempFile.getAbsolutePath()).thenReturn("/tmp/x");

            result.addTempFile(tempFile);

            assertThat(result.getTempFiles()).containsExactly(tempFile);
        }

        @Test
        @DisplayName("close() closes each temp file and clears the list")
        void closeClearsAndCloses() {
            PipelineResult result = new PipelineResult();
            TempFile a = mock(TempFile.class);
            TempFile b = mock(TempFile.class);
            when(a.getAbsolutePath()).thenReturn("/tmp/a");
            when(b.getAbsolutePath()).thenReturn("/tmp/b");
            result.addTempFile(a);
            result.addTempFile(b);

            result.close();

            verify(a).close();
            verify(b).close();
            assertThat(result.getTempFiles()).isEmpty();
        }

        @Test
        @DisplayName("cleanup() delegates to close()")
        void cleanupDelegates() {
            PipelineResult result = new PipelineResult();
            TempFile a = mock(TempFile.class);
            when(a.getAbsolutePath()).thenReturn("/tmp/a");
            result.addTempFile(a);

            result.cleanup();

            verify(a, times(1)).close();
            assertThat(result.getTempFiles()).isEmpty();
        }
    }
}
