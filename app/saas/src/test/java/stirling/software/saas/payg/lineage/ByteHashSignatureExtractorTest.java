package stirling.software.saas.payg.lineage;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ByteHashSignatureExtractorTest {

    private final ByteHashSignatureExtractor extractor = new ByteHashSignatureExtractor();

    @Test
    void identicalBytes_produceIdenticalSignatures(@TempDir Path tmp) throws IOException {
        Path a = tmp.resolve("a.bin");
        Path b = tmp.resolve("b.bin");
        byte[] contents = "hello, lineage".getBytes();
        Files.write(a, contents);
        Files.write(b, contents);

        Set<LineageSignature> sigsA = extractor.extract(a);
        Set<LineageSignature> sigsB = extractor.extract(b);

        assertThat(sigsA).isEqualTo(sigsB);
        assertThat(sigsA).hasSize(1);
        assertThat(sigsA.iterator().next().type()).isEqualTo("sha256");
    }

    @Test
    void differentBytes_produceDifferentSignatures(@TempDir Path tmp) throws IOException {
        Path a = tmp.resolve("a.bin");
        Path b = tmp.resolve("b.bin");
        Files.write(a, "one".getBytes());
        Files.write(b, "two".getBytes());

        Set<LineageSignature> sigsA = extractor.extract(a);
        Set<LineageSignature> sigsB = extractor.extract(b);

        assertThat(sigsA).isNotEqualTo(sigsB);
    }

    @Test
    void emptyFile_isHashable(@TempDir Path tmp) throws IOException {
        Path empty = tmp.resolve("empty.bin");
        Files.write(empty, new byte[0]);

        Set<LineageSignature> sigs = extractor.extract(empty);

        // SHA-256 of the empty string is a well-known constant.
        assertThat(sigs).hasSize(1);
        assertThat(sigs.iterator().next().value())
                .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    @Test
    void largeFile_streamsWithoutLoadingFullyInMemory(@TempDir Path tmp) throws IOException {
        // 10 MiB file. The extractor uses a 64 KiB buffer so this should hash without trouble.
        Path big = tmp.resolve("big.bin");
        byte[] block = new byte[64 * 1024];
        try (var out = Files.newOutputStream(big)) {
            for (int i = 0; i < 10 * 16; i++) {
                out.write(block);
            }
        }

        Set<LineageSignature> sigs = extractor.extract(big);

        assertThat(sigs).hasSize(1);
        assertThat(sigs.iterator().next().type()).isEqualTo("sha256");
    }

    @Test
    void name_isStable() {
        assertThat(extractor.name()).isEqualTo("sha256");
    }
}
