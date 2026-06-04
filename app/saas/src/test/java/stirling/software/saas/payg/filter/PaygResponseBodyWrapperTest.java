package stirling.software.saas.payg.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

class PaygResponseBodyWrapperTest {

    private final TempFileManager tempFileManager =
            new TempFileManager(new TempFileRegistry(), new ApplicationProperties());

    @Test
    void inMemory_smallWrites_clientReceivesAndPathContainsSameBytes() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 1024)) {
            wrapper.getOutputStream().write("hello world".getBytes(StandardCharsets.UTF_8));
            wrapper.getOutputStream().flush();

            assertThat(downstream.getContentAsString()).isEqualTo("hello world");
            assertThat(wrapper.bytesWritten()).isEqualTo(11);

            Path materialised = wrapper.materialisedPath();
            assertThat(materialised).isNotNull();
            assertThat(Files.readString(materialised, StandardCharsets.UTF_8))
                    .isEqualTo("hello world");
        }
    }

    @Test
    void spill_crossThresholdMidChunk_capturesEverything() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 8)) {
            // First write: 5 bytes — fits in memory.
            wrapper.getOutputStream().write("HELLO".getBytes(StandardCharsets.UTF_8));
            // Second write: 6 bytes — crosses the 8-byte threshold mid-chunk; whole chunk
            // ends up on disk per the design (we don't split the crossing chunk).
            wrapper.getOutputStream().write(" WORLD".getBytes(StandardCharsets.UTF_8));
            wrapper.getOutputStream().flush();

            assertThat(downstream.getContentAsString()).isEqualTo("HELLO WORLD");
            assertThat(wrapper.bytesWritten()).isEqualTo(11);

            Path path = wrapper.materialisedPath();
            assertThat(Files.readString(path, StandardCharsets.UTF_8)).isEqualTo("HELLO WORLD");
        }
    }

    @Test
    void spill_largeSingleWrite_capturedToDisk() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        byte[] payload = new byte[64 * 1024]; // 64 KiB
        for (int i = 0; i < payload.length; i++) {
            payload[i] = (byte) (i % 251);
        }
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 1024)) {
            wrapper.getOutputStream().write(payload);
            wrapper.getOutputStream().flush();

            assertThat(downstream.getContentAsByteArray()).isEqualTo(payload);
            assertThat(wrapper.bytesWritten()).isEqualTo(payload.length);

            byte[] disk = Files.readAllBytes(wrapper.materialisedPath());
            assertThat(disk).isEqualTo(payload);
        }
    }

    @Test
    void writer_pathTeesThroughToBuffer() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        downstream.setCharacterEncoding("UTF-8");
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 1024)) {
            PrintWriter writer = wrapper.getWriter();
            writer.write("a-string-from-writer");
            writer.flush();

            assertThat(downstream.getContentAsString()).isEqualTo("a-string-from-writer");
            Path path = wrapper.materialisedPath();
            assertThat(Files.readString(path, StandardCharsets.UTF_8))
                    .isEqualTo("a-string-from-writer");
        }
    }

    @Test
    void mixingOutputStreamAndWriter_throwsPerServletSpec() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 1024)) {
            wrapper.getOutputStream();
            assertThatThrownBy(wrapper::getWriter).isInstanceOf(IllegalStateException.class);
        }

        MockHttpServletResponse downstream2 = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper2 =
                new PaygResponseBodyWrapper(downstream2, tempFileManager, 1024)) {
            wrapper2.getWriter();
            assertThatThrownBy(wrapper2::getOutputStream).isInstanceOf(IllegalStateException.class);
        }
    }

    @Test
    void noBytesWritten_materialisedPathIsNull() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 1024)) {
            // Don't touch the output stream.
            assertThat(wrapper.materialisedPath()).isNull();
            assertThat(wrapper.bytesWritten()).isZero();
        }
    }

    @Test
    void resetBuffer_inMemory_clearsAccumulatedBytes() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 1024)) {
            wrapper.getOutputStream().write("draft".getBytes(StandardCharsets.UTF_8));
            wrapper.resetBuffer();
            assertThat(wrapper.bytesWritten()).isZero();
            assertThat(wrapper.materialisedPath()).isNull();

            wrapper.getOutputStream().write("final".getBytes(StandardCharsets.UTF_8));
            wrapper.getOutputStream().flush();
            assertThat(Files.readString(wrapper.materialisedPath(), StandardCharsets.UTF_8))
                    .isEqualTo("final");
        }
    }

    @Test
    void resetBuffer_afterSpill_dropsSpillFileAndStartsFresh() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 4)) {
            wrapper.getOutputStream().write("draftover".getBytes(StandardCharsets.UTF_8)); // spill
            assertThat(wrapper.bytesWritten()).isEqualTo(9);
            wrapper.resetBuffer();
            assertThat(wrapper.bytesWritten()).isZero();
            assertThat(wrapper.materialisedPath()).isNull();

            // Write again — should land in fresh memory, not the dropped spill.
            wrapper.getOutputStream().write("ok".getBytes(StandardCharsets.UTF_8));
            wrapper.getOutputStream().flush();
            assertThat(Files.readString(wrapper.materialisedPath(), StandardCharsets.UTF_8))
                    .isEqualTo("ok");
        }
    }

    @Test
    void close_isIdempotent() throws IOException {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 8);
        wrapper.getOutputStream().write("more-than-eight-bytes".getBytes(StandardCharsets.UTF_8));
        wrapper.materialisedPath(); // forces flush
        wrapper.close();
        wrapper.close(); // second call must not throw
    }

    @Test
    void materialisedPath_isStableAcrossCalls_whenInMemory() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 1024)) {
            wrapper.getOutputStream().write("abc".getBytes(StandardCharsets.UTF_8));
            Path first = wrapper.materialisedPath();
            Path second = wrapper.materialisedPath();
            assertThat(first).isEqualTo(second);
        }
    }

    @Test
    void singleByteWrites_areCorrectlyAccountedAcrossThreshold() throws Exception {
        MockHttpServletResponse downstream = new MockHttpServletResponse();
        try (PaygResponseBodyWrapper wrapper =
                new PaygResponseBodyWrapper(downstream, tempFileManager, 3)) {
            for (int b : "ABCDE".getBytes(StandardCharsets.UTF_8)) {
                wrapper.getOutputStream().write(b);
            }
            wrapper.getOutputStream().flush();
            assertThat(downstream.getContentAsString()).isEqualTo("ABCDE");
            assertThat(wrapper.bytesWritten()).isEqualTo(5);
            assertThat(Files.readString(wrapper.materialisedPath(), StandardCharsets.UTF_8))
                    .isEqualTo("ABCDE");
        }
    }

    @Test
    void negativeThreshold_rejected() {
        assertThatThrownBy(
                        () ->
                                new PaygResponseBodyWrapper(
                                        new MockHttpServletResponse(), tempFileManager, -1))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
