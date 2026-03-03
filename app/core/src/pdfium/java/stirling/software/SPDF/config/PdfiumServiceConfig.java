package stirling.software.SPDF.config;

import java.lang.foreign.Arena;
import java.lang.foreign.SymbolLookup;

import lombok.extern.slf4j.Slf4j;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import stirling.software.SPDF.service.pdf.PdfiumService;
import stirling.software.SPDF.service.pdf.impl.NoOpPdfiumService;
import stirling.software.SPDF.service.pdf.impl.PdfiumServiceImpl;

/**
 * Spring configuration for conditional PDFium service wiring.
 *
 * <p>Attempts to load {@code libpdfium.so} via FFM's {@link SymbolLookup#libraryLookup}. If the
 * library is found, wires the real {@link PdfiumServiceImpl}; otherwise falls back to {@link
 * NoOpPdfiumService} which returns original bytes unchanged.
 */
@Slf4j
@Configuration
public class PdfiumServiceConfig {

    @Bean
    public PdfiumService pdfiumService() {
        if (tryLoadPdfiumLibrary()) {
            log.info("[PDFium] libpdfium loaded — native operations enabled.");
            return new PdfiumServiceImpl();
        } else {
            log.warn("[PDFium] libpdfium not found — using NoOp fallback.");
            return new NoOpPdfiumService();
        }
    }

    /**
     * Attempt to locate the PDFium native library on the system. Tries platform-specific library
     * names: {@code libpdfium.so} (Linux), {@code libpdfium.dylib} (macOS), {@code pdfium.dll}
     * (Windows).
     *
     * @return true if the library was found and loaded
     */
    private boolean tryLoadPdfiumLibrary() {
        String[] candidates;
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("win")) {
            candidates = new String[] {"pdfium", "pdfium.dll"};
        } else if (os.contains("mac")) {
            candidates = new String[] {"libpdfium.dylib", "pdfium"};
        } else {
            candidates = new String[] {"libpdfium.so", "pdfium"};
        }

        for (String lib : candidates) {
            try {
                SymbolLookup.libraryLookup(lib, Arena.global());
                return true;
            } catch (IllegalArgumentException e) {
                log.debug("[PDFium] Library '{}' not found: {}", lib, e.getMessage());
            }
        }
        return false;
    }
}
