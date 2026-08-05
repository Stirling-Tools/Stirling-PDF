package stirling.software.common.pdf.ua;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.viewerpreferences.PDViewerPreferences;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.DublinCoreSchema;
import org.apache.xmpbox.schema.XMPSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpSerializer;

import lombok.extern.slf4j.Slf4j;

/**
 * Applies the document-level requirements of PDF/UA that have nothing to do with tagging.
 *
 * <p>These are the fixes that make an already-tagged file conform: a title that viewers actually
 * display, a declared language, a tab order, and the {@code pdfuaid} declaration itself. A
 * surprising share of real documents fail only on these.
 */
@Slf4j
public class PdfUaMetadataWriter {

    private static final COSName TABS = COSName.getPDFName("Tabs");
    private static final COSName SUSPECTS = COSName.getPDFName("Suspects");

    /**
     * Applies everything except the conformance declaration.
     *
     * @param title required by clause 7.1; falls back to the existing metadata title
     * @param language a BCP-47 tag such as {@code en-GB}
     */
    public List<String> applyDocumentRequirements(
            PDDocument document, String title, String language, PdfUaProfile profile)
            throws IOException {
        return applyDocumentRequirements(document, title, language, profile, false);
    }

    public List<String> applyDocumentRequirements(
            PDDocument document,
            String title,
            String language,
            PdfUaProfile profile,
            boolean preserveVersion)
            throws IOException {

        List<String> warnings = new ArrayList<>();
        PDDocumentCatalog catalog = document.getDocumentCatalog();

        if (language != null && !language.isBlank()) {
            catalog.setLanguage(language);
        }

        String effectiveTitle = resolveTitle(document, title);
        if (effectiveTitle != null) {
            PDDocumentInformation info = document.getDocumentInformation();
            info.setTitle(effectiveTitle);
            document.setDocumentInformation(info);
        }

        // Without this a viewer shows the filename instead of the title, which defeats the point.
        PDViewerPreferences preferences = catalog.getViewerPreferences();
        if (preferences == null) {
            preferences = new PDViewerPreferences(catalog.getCOSObject());
        }
        preferences.setDisplayDocTitle(true);
        catalog.setViewerPreferences(preferences);

        // Clause 7.18.1: every page needs an explicit tab order.
        for (PDPage page : document.getPages()) {
            page.getCOSObject().setName(TABS, "S");
        }

        // A structure tree flagged as suspect is not conforming.
        if (catalog.getMarkInfo() != null) {
            catalog.getMarkInfo().getCOSObject().removeItem(SUSPECTS);
        }

        if (!preserveVersion && document.getVersion() < profile.pdfVersion()) {
            document.setVersion(profile.pdfVersion());
        }

        warnings.addAll(describeFormFields(document));
        writeXmp(document, effectiveTitle, language, null);
        return warnings;
    }

    /**
     * Gives every form field a {@code /TU} description, which clause 7.18.1 requires.
     *
     * <p>The field's own partial name is used, because that is authored metadata already in the
     * document rather than something invented. A field with no name at all is reported instead of
     * being given a placeholder: "Text field 3" satisfies a checker and tells a user nothing.
     */
    private static List<String> describeFormFields(PDDocument document) {
        List<String> warnings = new ArrayList<>();
        PDAcroForm form = document.getDocumentCatalog().getAcroForm();
        if (form == null) {
            return warnings;
        }
        int unnamed = 0;
        for (PDField field : form.getFieldTree()) {
            String existing = field.getAlternateFieldName();
            if (existing != null && !existing.isBlank()) {
                continue;
            }
            String partialName = field.getPartialName();
            if (partialName == null || partialName.isBlank()) {
                unnamed++;
                continue;
            }
            field.setAlternateFieldName(partialName);
        }
        if (unnamed > 0) {
            warnings.add(
                    unnamed
                            + " form field(s) have neither a description nor a name, so no tooltip"
                            + " could be derived. Add one for each before claiming conformance.");
        }
        return warnings;
    }

    /**
     * Strips the {@code pdfuaid} declaration.
     *
     * <p>Used when validation fails after the claim was written: the remediated file is still worth
     * returning, but it must not assert conformance it does not have.
     */
    public void removeConformanceDeclaration(PDDocument document) throws IOException {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        XMPMetadata metadata = loadOrCreate(catalog);
        XMPSchema identification = metadata.getSchema(PdfUaIdentificationSchema.NAMESPACE);
        if (identification == null) {
            return;
        }
        metadata.removeSchema(identification);
        serialiseInto(document, metadata);
    }

    /** Writes the {@code pdfuaid:part} declaration. Only call this after validation has passed. */
    public void declareConformance(PDDocument document, PdfUaProfile profile) throws IOException {
        writeXmp(document, resolveTitle(document, null), documentLanguage(document), profile);
    }

    private String resolveTitle(PDDocument document, String preferred) {
        if (preferred != null && !preferred.isBlank()) {
            return preferred.strip();
        }
        String existing = document.getDocumentInformation().getTitle();
        return existing != null && !existing.isBlank() ? existing.strip() : null;
    }

    private static String documentLanguage(PDDocument document) {
        return document.getDocumentCatalog().getLanguage();
    }

    /**
     * Rewrites the XMP packet, preserving whatever was already there. A malformed existing packet
     * is replaced rather than propagated, since an unparseable packet fails validation on its own.
     */
    private void writeXmp(PDDocument document, String title, String language, PdfUaProfile profile)
            throws IOException {

        PDDocumentCatalog catalog = document.getDocumentCatalog();
        XMPMetadata metadata = loadOrCreate(catalog);

        if (title != null) {
            DublinCoreSchema dublinCore = metadata.getDublinCoreSchema();
            if (dublinCore == null) {
                dublinCore = metadata.createAndAddDublinCoreSchema();
            }
            dublinCore.setTitle(title);
            if (language != null
                    && !language.isBlank()
                    && (dublinCore.getLanguages() == null
                            || !dublinCore.getLanguages().contains(language))) {
                dublinCore.addLanguage(language);
            }
        }

        if (profile != null) {
            // Converting an already-declared file would otherwise leave two pdfuaid schemas in the
            // packet, which no validator accepts.
            XMPSchema stale = metadata.getSchema(PdfUaIdentificationSchema.NAMESPACE);
            if (stale != null) {
                metadata.removeSchema(stale);
            }
            PdfUaIdentificationSchema identification = new PdfUaIdentificationSchema(metadata);
            identification.setPart(profile.part());
            if (profile.revision() > 0) {
                identification.setRevision(profile.revision());
            }
            metadata.addSchema(identification);
        }

        serialiseInto(document, metadata);
    }

    private static void serialiseInto(PDDocument document, XMPMetadata metadata)
            throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            new XmpSerializer().serialize(metadata, out, true);
        } catch (javax.xml.transform.TransformerException e) {
            throw new IOException("Could not serialise XMP metadata", e);
        }
        PDMetadata pdMetadata = new PDMetadata(document);
        pdMetadata.importXMPMetadata(out.toByteArray());
        document.getDocumentCatalog().setMetadata(pdMetadata);
    }

    private XMPMetadata loadOrCreate(PDDocumentCatalog catalog) {
        PDMetadata existing = catalog.getMetadata();
        if (existing != null) {
            try {
                DomXmpParser parser = new DomXmpParser();
                // Strict parsing rejects namespaces XMPBox does not know, which includes pdfuaid
                // itself. Left strict, re-reading a packet we just wrote silently discards all of
                // it, taking the title and language with it.
                parser.setStrictParsing(false);
                return parser.parse(new ByteArrayInputStream(existing.toByteArray()));
            } catch (Exception e) {
                log.debug("Replacing unparseable XMP packet: {}", e.getMessage());
            }
        }
        return XMPMetadata.createXMPMetadata();
    }
}
