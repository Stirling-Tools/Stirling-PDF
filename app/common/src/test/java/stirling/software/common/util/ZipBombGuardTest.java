package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ZipBombGuardTest {

    @Test
    void readEntry_underLimit_returnsBytes() throws Exception {
        byte[] data = new byte[1024];
        byte[] out = ZipBombGuard.readEntry(new ByteArrayInputStream(data), 4096);
        assertArrayEquals(data, out);
    }

    @Test
    void readEntry_overLimit_throwsZipBomb() {
        byte[] data = new byte[5000];
        ZipBombGuard.ZipBombException ex =
                assertThrows(
                        ZipBombGuard.ZipBombException.class,
                        () -> ZipBombGuard.readEntry(new ByteArrayInputStream(data), 4096));
        assertTrue(ex.getMessage().contains("maximum allowed"));
    }

    @Test
    void budget_perEntryCap_throws() {
        ZipBombGuard.Budget budget = new ZipBombGuard.Budget(1000, 1_000_000, 100);
        assertThrows(
                ZipBombGuard.ZipBombException.class,
                () -> budget.readEntry(new ByteArrayInputStream(new byte[2000])));
    }

    @Test
    void budget_cumulativeTotal_throwsAcrossEntries() throws Exception {
        ZipBombGuard.Budget budget = new ZipBombGuard.Budget(1000, 2500, 100);
        budget.readEntry(new ByteArrayInputStream(new byte[1000]));
        budget.readEntry(new ByteArrayInputStream(new byte[1000]));
        assertThrows(
                ZipBombGuard.ZipBombException.class,
                () -> budget.readEntry(new ByteArrayInputStream(new byte[1000])));
    }

    @Test
    void budget_entryCount_throws() throws Exception {
        ZipBombGuard.Budget budget = new ZipBombGuard.Budget(1000, 1_000_000, 2);
        budget.readEntry(new ByteArrayInputStream(new byte[10]));
        budget.readEntry(new ByteArrayInputStream(new byte[10]));
        assertThrows(
                ZipBombGuard.ZipBombException.class,
                () -> budget.readEntry(new ByteArrayInputStream(new byte[10])));
    }

    @Test
    void copyEntry_underLimit_writesFile(@TempDir Path dir) throws Exception {
        Path target = dir.resolve("out.bin");
        byte[] data = "hello world".getBytes();
        new ZipBombGuard.Budget().copyEntry(new ByteArrayInputStream(data), target);
        assertArrayEquals(data, Files.readAllBytes(target));
    }

    @Test
    void copyEntry_overLimit_throws(@TempDir Path dir) {
        Path target = dir.resolve("big.bin");
        ZipBombGuard.Budget budget = new ZipBombGuard.Budget(1000, 1_000_000, 100);
        assertThrows(
                ZipBombGuard.ZipBombException.class,
                () -> budget.copyEntry(new ByteArrayInputStream(new byte[2000]), target));
    }

    @Test
    void defaults_matchAttachmentServiceLimits() {
        assertEquals(100L * 1024 * 1024, ZipBombGuard.MAX_ENTRY_BYTES);
        assertEquals(500L * 1024 * 1024, ZipBombGuard.MAX_TOTAL_BYTES);
    }
}
