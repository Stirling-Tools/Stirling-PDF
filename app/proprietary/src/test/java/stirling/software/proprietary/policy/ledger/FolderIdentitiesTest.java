package stirling.software.proprietary.policy.ledger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Tests for {@link FolderIdentities}: the input source and output sink must derive the same
 * identity for the same file - including through a symlinked alias of the directory - or
 * self-output skipping silently breaks.
 */
class FolderIdentitiesTest {

    @TempDir Path tempDir;

    @Test
    void identityAgreesAcrossASymlinkedAliasOfTheDirectory() throws IOException {
        Path real = Files.createDirectories(tempDir.resolve("real"));
        Path alias = Files.createSymbolicLink(tempDir.resolve("alias"), real);
        Files.writeString(real.resolve("doc.pdf"), "data");

        String viaReal =
                FolderIdentities.identity(
                        FolderIdentities.canonicalDir(real), real, real.resolve("doc.pdf"));
        String viaAlias =
                FolderIdentities.identity(
                        FolderIdentities.canonicalDir(alias), alias, alias.resolve("doc.pdf"));

        assertEquals(viaReal, viaAlias);
    }

    @Test
    void identityOfANestedFileKeepsItsRelativePath() throws IOException {
        Path dir = Files.createDirectories(tempDir.resolve("in"));
        Path nested = Files.createDirectories(dir.resolve("sub")).resolve("doc.pdf");
        Files.writeString(nested, "data");

        String identity =
                FolderIdentities.identity(FolderIdentities.canonicalDir(dir), dir, nested);

        assertTrue(identity.endsWith("sub" + java.io.File.separator + "doc.pdf"));
    }

    @Test
    void statSignatureTracksSizeAndMtime() throws IOException {
        Path file = tempDir.resolve("doc.pdf");
        Files.writeString(file, "data");
        String before = FolderIdentities.statSignature(file);

        Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(60)));

        assertNotEquals(before, FolderIdentities.statSignature(file));
    }

    @Test
    void hashSignatureIgnoresMtimeButTracksContent() throws IOException {
        Path file = tempDir.resolve("doc.pdf");
        Files.writeString(file, "data");
        String before = FolderIdentities.hashSignature(file);

        Files.setLastModifiedTime(file, FileTime.from(Instant.now().plusSeconds(60)));
        assertEquals(before, FolderIdentities.hashSignature(file));

        Files.writeString(file, "different");
        assertNotEquals(before, FolderIdentities.hashSignature(file));
    }

    @Test
    void identityHashIsAStableFixedWidthKey() {
        String hash = FolderIdentities.identityHash("/in/doc.pdf");

        assertEquals(64, hash.length());
        assertEquals(hash, FolderIdentities.identityHash("/in/doc.pdf"));
        assertNotEquals(hash, FolderIdentities.identityHash("/in/other.pdf"));
    }
}
