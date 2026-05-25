package stirling.software.common.jpdfium;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.jpdfium.PdfDocument;

class JPDFiumSmokeTest {

    @Test
    void opensExamplePdfAndReadsPageCount(@TempDir Path tmp) throws IOException {
        Path pdf = tmp.resolve("example.pdf");
        try (InputStream in = getClass().getResourceAsStream("/example.pdf")) {
            assertNotNull(in, "example.pdf must exist under src/test/resources");
            Files.copy(in, pdf);
        }

        try (PdfDocument doc = PdfDocument.open(pdf)) {
            assertTrue(
                    doc.pageCount() >= 1,
                    "PdfDocument should report at least one page for example.pdf");
        }
    }
}
