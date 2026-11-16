package stirling.software.proprietary.service.ua;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.officeconvert.pdfa.FontEmbedder;

/**
 * Embeds any font the document references but does not carry, as PDF/UA-1 clause 7.21 requires.
 * Stirling Office Convert embeds in place, keeping form fields and the structure tree.
 */
@Service
@Slf4j
public class FontEmbeddingService {

    public boolean hasUnembeddedFonts(byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            return !findUnembeddedFonts(document).isEmpty();
        } catch (IOException e) {
            log.debug("Could not inspect fonts: {}", e.getMessage());
            return false;
        }
    }

    public static Set<String> findUnembeddedFonts(PDDocument document) {
        Set<String> missing = new HashSet<>();
        for (PDPage page : document.getPages()) {
            PDResources resources = page.getResources();
            if (resources == null) {
                continue;
            }
            for (COSName name : resources.getFontNames()) {
                try {
                    PDFont font = resources.getFont(name);
                    if (font != null && !font.isEmbedded()) {
                        missing.add(font.getName());
                    }
                } catch (IOException e) {
                    log.debug("Could not read font {}: {}", name.getName(), e.getMessage());
                }
            }
        }
        return missing;
    }

    /**
     * Returns the document with all fonts embedded, or the input unchanged. Never throws: failing
     * to embed is a reportable shortfall, not a reason to abandon the conversion.
     */
    public Result embedFonts(byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            Set<String> missing = findUnembeddedFonts(document);
            if (missing.isEmpty()) {
                return new Result(pdfBytes, false, Set.of(), null);
            }
            FontEmbedder.Result result = FontEmbedder.embedMissing(document);
            if (result.embedded().isEmpty()) {
                return new Result(
                        pdfBytes,
                        false,
                        missing,
                        missing.size()
                                + " font(s) could not be embedded ("
                                + String.join(", ", missing)
                                + "). PDF/UA requires every font to be embedded.");
            }
            if (!result.incomplete().isEmpty()) {
                return new Result(
                        pdfBytes,
                        false,
                        missing,
                        "Embedding "
                                + String.join(", ", result.incomplete())
                                + " would leave characters with no glyph, so the fonts were left"
                                + " as they were. PDF/UA requires every font to be embedded.");
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            Set<String> remaining;
            try (PDDocument saved = Loader.loadPDF(out.toByteArray())) {
                remaining = findUnembeddedFonts(saved);
            }
            if (!remaining.isEmpty()) {
                return new Result(
                        out.toByteArray(),
                        true,
                        remaining,
                        remaining.size()
                                + " font(s) could not be embedded ("
                                + String.join(", ", remaining)
                                + "). PDF/UA requires every font to be embedded.");
            }
            log.info("Embedded {} previously unembedded font(s)", missing.size());
            return new Result(out.toByteArray(), true, missing, null);
        } catch (IOException | RuntimeException e) {
            log.warn("Font embedding failed: {}", e.getMessage());
            return new Result(
                    pdfBytes, false, Set.of(), "Font embedding failed: " + e.getMessage());
        }
    }

    /**
     * @param warning non-null when fonts remain unembedded, for the conversion report
     */
    public record Result(byte[] pdfBytes, boolean changed, Set<String> fonts, String warning) {}
}
