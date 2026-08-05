package stirling.software.SPDF.service.ua;

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

import stirling.software.common.pdf.ua.PdfUaIdentificationSchema;
import stirling.software.common.pdf.ua.PdfUaProfile;
import stirling.software.common.pdf.ua.PdfUaTagger;
import stirling.software.common.pdf.ua.TaggingOptions;
import stirling.software.common.pdf.ua.TaggingResult;

/**
 * Raises a PDF/A file from conformance level B to level A.
 *
 * <p>The two levels differ by accessibility: level B guarantees only that the file will look the
 * same in future, while level A additionally requires a tagged structure tree, a declared language
 * and Unicode-mappable text. That is the same machinery the PDF/UA tagger already provides, so
 * level A costs a tagging pass rather than a second engine.
 *
 * <p>Order is not negotiable. Ghostscript produces the PDF/A file and discards any structure tree
 * on the way through, so tagging has to happen afterwards. Running it first silently throws the
 * tags away and yields a level B file wearing a level A claim.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PdfaAccessibilityService {

    private final PdfUaValidationService validationService;
    private final stirling.software.SPDF.service.VeraPDFService veraPdfService;

    /**
     * @param pdfBytes the upgraded document
     * @param levelA true when the file was successfully tagged and may claim conformance A
     */
    public record Result(byte[] pdfBytes, boolean levelA, List<String> warnings) {}

    /**
     * Tags an already-converted PDF/A file and marks it conformance A.
     *
     * <p>Returns the input unchanged, with an explanation, if tagging cannot produce a structure
     * tree. A level A claim over untagged content is exactly the false claim to avoid.
     *
     * @param part the PDF/A part, 1 to 3; part 1 keeps its PDF 1.4 version
     */
    public Result upgradeToLevelA(byte[] pdfBytes, int part, String language, String title) {
        return upgradeToLevelA(pdfBytes, part, language, title, false);
    }

    /**
     * @param alsoDeclareUa additionally claim PDF/UA, but only if it validates
     */
    public Result upgradeToLevelA(
            byte[] pdfBytes, int part, String language, String title, boolean alsoDeclareUa) {
        List<String> warnings = new ArrayList<>();
        try {
            byte[] tagged;
            TaggingResult taggingResult;

            try (PDDocument document = Loader.loadPDF(pdfBytes)) {
                TaggingOptions options =
                        TaggingOptions.builder()
                                .profile(PdfUaProfile.UA1)
                                .language(language)
                                .title(title)
                                .fallbackTitle(title)
                                // Ghostscript already embedded the fonts on the PDF/A pass, and a
                                // second rewrite would undo the conversion we just made.
                                .embedFonts(false)
                                // PDF/A-1 is defined on PDF 1.4; raising it would break
                                // conformance.
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

            // Tagging is necessary for level A but not sufficient: it also requires Unicode
            // mappings on every font and more. Claiming A because a structure tree exists is the
            // same unvalidated assertion this converter refuses to make for PDF/UA.
            if (!validatesAtLevelA(declared, part)) {
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
     * Declares PDF/UA alongside PDF/A in one file.
     *
     * <p>This is the combination archives and public bodies actually ask for: readable in fifty
     * years <em>and</em> usable with a screen reader today. It needs more than writing both
     * identifiers, because PDF/A forbids XMP properties that no schema describes, and XMPBox has no
     * PDF/UA schema. Without the extension schema below, adding {@code pdfuaid} to a PDF/A file
     * breaks the PDF/A conformance it already had.
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
     * Describes the pdfuaid namespace so a PDF/A validator accepts it.
     *
     * <p>The structured types are populated field by field rather than by subclassing: XMPBox reads
     * each type's namespace from a {@code @StructuredType} annotation, and annotations are not
     * inherited, so a subclass loses the very metadata the type needs to serialise.
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

    /**
     * Asks veraPDF whether the file really meets level A, rather than assuming tagging is enough.
     */
    private boolean validatesAtLevelA(byte[] pdfBytes, int part) {
        try {
            return veraPdfService.validatePDF(new ByteArrayInputStream(pdfBytes)).stream()
                    .filter(r -> (part + "a").equalsIgnoreCase(r.getStandard()))
                    .anyMatch(
                            stirling.software.SPDF.model.api.security.PDFVerificationResult
                                    ::isCompliant);
        } catch (Exception e) {
            log.warn("Level A validation could not run: {}", e.getMessage());
            return false;
        }
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
     * PDFBox compresses into object streams by default, which requires PDF 1.5 and would quietly
     * push a PDF/A-1 file off its required 1.4 version. Part 1 is therefore saved uncompressed,
     * matching what the PDF/A converter already does.
     */
    private static byte[] save(PDDocument document, int part) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(
                out, part == 1 ? CompressParameters.NO_COMPRESSION : new CompressParameters());
        return out.toByteArray();
    }
}
