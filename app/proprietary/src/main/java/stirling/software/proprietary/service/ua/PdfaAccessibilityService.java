package stirling.software.proprietary.service.ua;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdfwriter.compress.CompressParameters;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.PDFAExtensionSchema;
import org.apache.xmpbox.schema.PDFAIdentificationSchema;
import org.apache.xmpbox.type.AbstractStructuredType;
import org.apache.xmpbox.type.ArrayProperty;
import org.apache.xmpbox.type.Cardinality;
import org.apache.xmpbox.type.PDFAPropertyType;
import org.apache.xmpbox.type.PDFASchemaType;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpSerializer;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.PdfaLevelAServiceInterface;
import stirling.software.proprietary.pdf.ua.PdfUaIdentificationSchema;
import stirling.software.proprietary.pdf.ua.PdfUaProfile;
import stirling.software.proprietary.pdf.ua.PdfUaTagger;
import stirling.software.proprietary.pdf.ua.TaggingOptions;
import stirling.software.proprietary.pdf.ua.TaggingResult;

/**
 * Raises a PDF/A file from conformance level B to level A, which adds the tagging the PDF/UA tagger
 * already does. Must run after Ghostscript, which discards any structure tree it is given.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PdfaAccessibilityService implements PdfaLevelAServiceInterface {

    /**
     * Matches the PDF/UA converter's own cap; beyond this the structure model exhausts the heap.
     */
    private static final int MAX_TAGGABLE_PAGES = 2000;

    private final PdfUaValidationService validationService;

    /**
     * Tags a converted PDF/A and marks it conformance A, or returns it unchanged rather than
     * claiming level A over untagged content. part is 1 to 3; part 1 keeps its PDF 1.4 version.
     */
    public Result upgradeToLevelA(byte[] pdfBytes, int part, String language, String title) {
        return upgradeToLevelA(pdfBytes, part, language, title, false);
    }

    /**
     * @param alsoDeclareUa additionally claim PDF/UA, but only if it validates
     */
    @Override
    public Result upgradeToLevelA(
            byte[] pdfBytes, int part, String language, String title, boolean alsoDeclareUa) {
        List<String> warnings = new ArrayList<>();
        try {
            byte[] tagged;
            TaggingResult taggingResult;

            try (PDDocument document = Loader.loadPDF(pdfBytes)) {
                // Tagging holds a model of the whole document; without a cap a large file exhausts
                // the heap, and OutOfMemoryError is an Error, so the catch below never sees it.
                if (document.getNumberOfPages() > MAX_TAGGABLE_PAGES) {
                    warnings.add(
                            "This document has "
                                    + document.getNumberOfPages()
                                    + " pages, more than the "
                                    + MAX_TAGGABLE_PAGES
                                    + " that can be tagged, so it was left at conformance level B.");
                    return new Result(pdfBytes, false, warnings);
                }
                TaggingOptions options =
                        TaggingOptions.builder()
                                .profile(PdfUaProfile.UA1)
                                .language(language)
                                .title(title)
                                .fallbackTitle(title)
                                // Fonts were embedded on the PDF/A pass; a rewrite would undo it.
                                .embedFonts(false)
                                // PDF/A-1 is defined on PDF 1.4; raising it breaks conformance.
                                .preservePdfVersion(part == 1)
                                .existingTags(TaggingOptions.ExistingTags.AUTO)
                                .build();

                taggingResult = new PdfUaTagger().tag(document, options);
                warnings.addAll(taggingResult.getWarnings());
                tagged = save(document, part);
            }

            if (taggingResult.getTaggedElements() == 0 && taggingResult.isRebuilt()) {
                warnings.add(
                        "No taggable content was found, so the file cannot claim PDF/A level A."
                                + " It remains valid at level B.");
                return new Result(pdfBytes, false, warnings);
            }
            if (taggingResult.isContentSuppressed()) {
                warnings.add(
                        "Some text could not be tagged reliably and was marked as an artifact, so"
                                + " no level A claim was written. The file remains valid at level B.");
                return new Result(tagged, false, warnings);
            }

            byte[] declared = setConformance(tagged, part, "A");

            // Tagging is necessary for level A but not sufficient: Unicode mappings are too.
            if (!validationService.validatesAsPdfaLevelA(declared, part)) {
                warnings.add(
                        "The document was tagged but does not validate as PDF/A-"
                                + part
                                + "a, so it was left at conformance level B.");
                return new Result(setConformance(tagged, part, "B"), false, warnings);
            }

            if (alsoDeclareUa) {
                byte[] withUa = declarePdfUaAlongsidePdfa(declared, part);
                var uaResult = validationService.validate(withUa, PdfUaProfile.UA1);
                if (uaResult.compliant()) {
                    log.info("Upgraded PDF/A-{} to level A and declared PDF/UA", part);
                    return new Result(withUa, true, warnings);
                }
                // The archival upgrade stands on its own; only the accessibility claim is dropped.
                warnings.add(
                        "PDF/UA was requested alongside PDF/A but "
                                + uaResult.totalFailures()
                                + " accessibility check(s) still fail, so no PDF/UA claim was"
                                + " written. The file is valid PDF/A-"
                                + part
                                + "a.");
            }

            log.info("Upgraded PDF/A-{} to conformance level A", part);
            return new Result(declared, true, warnings);

        } catch (Exception e) {
            log.warn("Could not upgrade to PDF/A level A: {}", e.getMessage());
            warnings.add(
                    "Level A upgrade failed ("
                            + e.getMessage()
                            + "), so the file was left at conformance level B.");
            return new Result(pdfBytes, false, warnings);
        }
    }

    /**
     * Declares PDF/UA alongside PDF/A in one file. The extension schema is required: PDF/A forbids
     * XMP properties no schema describes, and XMPBox has none for {@code pdfuaid}.
     */
    static byte[] declarePdfUaAlongsidePdfa(byte[] pdfBytes, int part) throws Exception {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            XMPMetadata xmp = parseOrCreate(document);

            PdfUaIdentificationSchema identification = new PdfUaIdentificationSchema(xmp);
            identification.setPart(1);
            xmp.addSchema(identification);

            addPdfUaExtensionSchema(xmp);
            writeMetadata(document, xmp);
            return save(document, part);
        }
    }

    /**
     * Describes the pdfuaid namespace so a PDF/A validator accepts it. Fields are set individually,
     * not by subclassing: XMPBox reads the namespace from an annotation, which is not inherited.
     */
    private static void addPdfUaExtensionSchema(XMPMetadata xmp) {
        PDFAExtensionSchema extension =
                (PDFAExtensionSchema) xmp.getSchema(PDFAExtensionSchema.class);
        if (extension == null) {
            extension = xmp.createAndAddPDFAExtensionSchemaWithDefaultNS();
        }

        PDFAPropertyType partProperty = new PDFAPropertyType(xmp);
        addField(xmp, partProperty, PDFAPropertyType.NAME, "part");
        addField(xmp, partProperty, PDFAPropertyType.VALUETYPE, "Integer");
        addField(xmp, partProperty, PDFAPropertyType.CATEGORY, "internal");
        addField(
                xmp,
                partProperty,
                PDFAPropertyType.DESCRIPTION,
                "Indicates which part of ISO 14289 the document conforms to");

        PDFASchemaType schema = new PDFASchemaType(xmp);
        addField(xmp, schema, PDFASchemaType.SCHEMA, "PDF/UA Universal Accessibility Schema");
        addField(xmp, schema, PDFASchemaType.NAMESPACE_URI, PdfUaIdentificationSchema.NAMESPACE);
        addField(xmp, schema, PDFASchemaType.PREFIX, PdfUaIdentificationSchema.PREFERRED_PREFIX);

        ArrayProperty properties =
                xmp.getTypeMapping()
                        .createArrayProperty(
                                schema.getNamespace(),
                                schema.getPrefix(),
                                PDFASchemaType.PROPERTY,
                                Cardinality.Seq);
        properties.getContainer().addProperty(partProperty);
        schema.getContainer().addProperty(properties);

        // A freshly created extension schema has no schemas bag yet, so make one.
        ArrayProperty schemas = extension.getSchemasProperty();
        if (schemas == null) {
            schemas =
                    xmp.getTypeMapping()
                            .createArrayProperty(
                                    extension.getNamespace(),
                                    extension.getPrefix(),
                                    PDFAExtensionSchema.SCHEMAS,
                                    Cardinality.Bag);
            extension.addProperty(schemas);
        }
        schemas.getContainer().addProperty(schema);
    }

    /** Adds one text field to a structured type, in that type's own namespace. */
    private static void addField(
            XMPMetadata xmp, AbstractStructuredType target, String name, String value) {
        target.getContainer()
                .addProperty(
                        xmp.getTypeMapping()
                                .createText(
                                        target.getNamespace(), target.getPrefix(), name, value));
    }

    private static XMPMetadata parseOrCreate(PDDocument document) throws Exception {
        PDMetadata existing = document.getDocumentCatalog().getMetadata();
        if (existing == null) {
            return XMPMetadata.createXMPMetadata();
        }
        try (InputStream in = new ByteArrayInputStream(existing.toByteArray())) {
            DomXmpParser parser = new DomXmpParser();
            parser.setStrictParsing(false);
            return parser.parse(in);
        }
    }

    private static void writeMetadata(PDDocument document, XMPMetadata xmp) throws Exception {
        ByteArrayOutputStream serialised = new ByteArrayOutputStream();
        new XmpSerializer().serialize(xmp, serialised, true);
        PDMetadata metadata = new PDMetadata(document);
        metadata.importXMPMetadata(serialised.toByteArray());
        document.getDocumentCatalog().setMetadata(metadata);
    }

    /** Rewrites {@code pdfaid:conformance} without disturbing the rest of the packet. */
    static byte[] setConformance(byte[] pdfBytes, int part, String conformance) throws Exception {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            PDMetadata existing = document.getDocumentCatalog().getMetadata();
            XMPMetadata xmp;
            if (existing != null) {
                try (InputStream in = new ByteArrayInputStream(existing.toByteArray())) {
                    DomXmpParser parser = new DomXmpParser();
                    parser.setStrictParsing(false);
                    xmp = parser.parse(in);
                }
            } else {
                xmp = XMPMetadata.createXMPMetadata();
            }

            PDFAIdentificationSchema identification =
                    (PDFAIdentificationSchema) xmp.getSchema(PDFAIdentificationSchema.class);
            if (identification == null) {
                identification = xmp.createAndAddPDFAIdentificationSchema();
            }
            identification.setPart(part);
            identification.setConformance(conformance);

            ByteArrayOutputStream serialised = new ByteArrayOutputStream();
            new XmpSerializer().serialize(xmp, serialised, true);
            PDMetadata metadata = new PDMetadata(document);
            metadata.importXMPMetadata(serialised.toByteArray());
            document.getDocumentCatalog().setMetadata(metadata);

            return save(document, part);
        }
    }

    /**
     * Part 1 is saved uncompressed: PDFBox's default object streams need PDF 1.5, which would push
     * a PDF/A-1 file off its required 1.4 version.
     */
    private static byte[] save(PDDocument document, int part) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(
                out, part == 1 ? CompressParameters.NO_COMPRESSION : new CompressParameters());
        return out.toByteArray();
    }
}
