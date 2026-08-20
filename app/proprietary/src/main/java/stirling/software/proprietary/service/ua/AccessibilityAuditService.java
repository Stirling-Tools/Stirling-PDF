package stirling.software.proprietary.service.ua;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.interactive.viewerpreferences.PDViewerPreferences;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.proprietary.model.api.ua.AccessibilityIssue;
import stirling.software.proprietary.model.api.ua.AccessibilityReport;
import stirling.software.proprietary.model.api.ua.FigureDescriptor;
import stirling.software.proprietary.model.api.ua.UaValidationResult;
import stirling.software.proprietary.pdf.ua.BBox;
import stirling.software.proprietary.pdf.ua.DocumentStructure;
import stirling.software.proprietary.pdf.ua.LayoutAnalyzer;
import stirling.software.proprietary.pdf.ua.PageContent;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.pdf.ua.StructBlock;
import stirling.software.proprietary.pdf.ua.StructType;
import stirling.software.proprietary.pdf.ua.TaggedContentExtractor;

/** Produces an accessibility report without changing the document. */
@ApplicationScoped
@Slf4j
@RequiredArgsConstructor
public class AccessibilityAuditService {

    /** Checks no validator can make; omitting them implies the work does not exist. */
    private static final List<String> HUMAN_CHECKS =
            List.of(
                    "Is the reading order correct for someone who cannot see the layout?",
                    "Does each alternative description convey what the image is for, not just what"
                            + " it looks like?",
                    "Are headings used for structure rather than for visual emphasis?",
                    "Is any information conveyed by colour alone also available another way?",
                    "Do tables have headers that identify the right rows and columns?",
                    "Is the document language correct, including for quoted passages?",
                    "Do links describe their destination rather than saying 'click here'?");

    /** The report walks every page and validates, so it carries the conversion's own caps. */
    private static final long MAX_INPUT_BYTES = 100L * 1024 * 1024;

    private static final int MAX_PAGES = 2000;

    private final PdfUaValidationService validationService;

    public AccessibilityReport audit(byte[] pdfBytes, PdfUaProfile profile) throws IOException {
        enforceLimits(pdfBytes);
        AccessibilityReport report = new AccessibilityReport();
        report.setProfile(profile.displayName());

        UaValidationResult validation = validationService.validate(pdfBytes, profile);
        report.setIssues(validation.issues());
        report.setPassesAutomatedChecks(validation.compliant());
        report.setHumanChecks(HUMAN_CHECKS);

        int fixable = 0;
        int needsInput = 0;
        for (AccessibilityIssue issue : validation.issues()) {
            if (issue.isAutoFixable()) {
                fixable++;
            } else {
                needsInput++;
            }
        }
        report.setAutomaticallyFixable(fixable);
        report.setNeedsInput(needsInput);

        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            populateSummary(document, report);
            report.setFiguresNeedingDescription(figuresNeedingDescription(document));
        } catch (IOException e) {
            log.debug("Could not inspect document for the summary: {}", e.getMessage());
        }
        return report;
    }

    /**
     * Rejects before the expensive pass. An unreadable file is left to the report itself to say.
     */
    private static void enforceLimits(byte[] pdfBytes) {
        if (pdfBytes.length > MAX_INPUT_BYTES) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileTooLarge",
                    "This PDF is {0} MB. The accessibility report is limited to {1} MB.",
                    pdfBytes.length / (1024 * 1024),
                    MAX_INPUT_BYTES / (1024 * 1024));
        }
        int pages;
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            pages = document.getNumberOfPages();
        } catch (IOException e) {
            return;
        }
        if (pages > MAX_PAGES) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.tooManyPages",
                    "This PDF has {0} pages. The accessibility report is limited to {1} pages;"
                            + " split it first.",
                    pages,
                    MAX_PAGES);
        }
    }

    private void populateSummary(PDDocument document, AccessibilityReport report)
            throws IOException {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        AccessibilityReport.Summary summary = report.getSummary();

        report.setTagged(catalog.getStructureTreeRoot() != null);
        report.setDeclaresConformance(declaresUa(document));

        summary.setPages(document.getNumberOfPages());
        summary.setEncrypted(document.isEncrypted());
        summary.setHasLanguage(catalog.getLanguage() != null && !catalog.getLanguage().isBlank());

        String title = document.getDocumentInformation().getTitle();
        summary.setHasTitle(title != null && !title.isBlank());

        PDViewerPreferences preferences = catalog.getViewerPreferences();
        summary.setDisplaysDocTitle(preferences != null && preferences.displayDocTitle());

        Set<String> unembedded = FontEmbeddingService.findUnembeddedFonts(document);
        summary.setUnembeddedFonts(unembedded.size());
        summary.setAllFontsEmbedded(unembedded.isEmpty());

        try {
            summary.setFigures(new TaggedContentExtractor().countGraphics(document));
        } catch (Exception e) {
            log.debug("Could not count figures: {}", e.getMessage());
        }
    }

    /**
     * Lists the figures a conversion would leave undescribed, running the converter's own analysis
     * because counting raster images would miss vector charts and existing descriptions.
     */
    private List<FigureDescriptor> figuresNeedingDescription(PDDocument document) {
        try {
            List<PageContent> pages = new TaggedContentExtractor().extract(document);
            DocumentStructure structure = new LayoutAnalyzer().analyse(pages);
            List<FigureDescriptor> figures = new ArrayList<>();
            for (StructBlock block : structure.figuresWithoutAlt()) {
                int ordinal = block.getRanges().isEmpty() ? -1 : block.getRanges().get(0).start();
                BBox box = block.getBbox();
                figures.add(
                        new FigureDescriptor(
                                block.getPageIndex() + ":" + ordinal,
                                block.getPageIndex() + 1,
                                block.getType() == StructType.FORMULA ? "formula" : "figure",
                                box.x0(),
                                box.y0(),
                                box.width(),
                                box.height(),
                                block.getAlt()));
            }
            return figures;
        } catch (Exception e) {
            log.debug("Could not enumerate figures: {}", e.getMessage());
            return List.of();
        }
    }

    /** True when the XMP packet carries a pdfuaid identifier. */
    private static boolean declaresUa(PDDocument document) {
        try {
            var metadata = document.getDocumentCatalog().getMetadata();
            if (metadata == null) {
                return false;
            }
            String xmp =
                    new String(metadata.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
            return xmp.contains("pdfuaid");
        } catch (IOException e) {
            return false;
        }
    }
}
