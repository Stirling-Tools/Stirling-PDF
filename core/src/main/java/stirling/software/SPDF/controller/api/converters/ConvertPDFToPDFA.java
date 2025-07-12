package stirling.software.SPDF.controller.api.converters;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TimeZone;

import org.apache.commons.io.FileUtils;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdfwriter.compress.CompressParameters;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.font.PDTrueTypeFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.color.PDOutputIntent;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationTextMarkup;
import org.apache.pdfbox.pdmodel.interactive.viewerpreferences.PDViewerPreferences;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.AdobePDFSchema;
import org.apache.xmpbox.schema.DublinCoreSchema;
import org.apache.xmpbox.schema.PDFAIdentificationSchema;
import org.apache.xmpbox.schema.XMPBasicSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpSerializer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Slf4j
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertPDFToPDFA {

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/pdfa")
    @Operation(
            summary = "Convert a PDF to a PDF/A",
            description =
                    "This endpoint converts a PDF file to a PDF/A file using LibreOffice. PDF/A is a format designed for long-term archiving of digital documents. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> pdfToPdfA(@ModelAttribute PdfToPdfARequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        String outputFormat = request.getOutputFormat();

        // Validate input file type
        if (!"application/pdf".equals(inputFile.getContentType())) {
            log.error("Invalid input file type: {}", inputFile.getContentType());
            throw ExceptionUtils.createPdfFileRequiredException();
        }

        // Get the original filename without extension
        String originalFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFileName == null || originalFileName.trim().isEmpty()) {
            originalFileName = "output.pdf";
        }
        String baseFileName =
                originalFileName.contains(".")
                        ? originalFileName.substring(0, originalFileName.lastIndexOf('.'))
                        : originalFileName;

        Path tempInputFile = null;
        byte[] fileBytes;
        Path loPdfPath = null; // Used for LibreOffice conversion output
        File preProcessedFile = null;
        int pdfaPart = 2;

        try {
            // Save uploaded file to temp location
            tempInputFile = Files.createTempFile("input_", ".pdf");
            inputFile.transferTo(tempInputFile);

            // Branch conversion based on desired output PDF/A format
            if ("pdfa".equals(outputFormat)) {
                preProcessedFile = tempInputFile.toFile();
            } else {
                pdfaPart = 1;
                preProcessedFile = preProcessHighlights(tempInputFile.toFile());
            }
            Set<String> missingFonts = new HashSet<>();
            boolean needImgs = false;
            try (PDDocument doc = Loader.loadPDF(preProcessedFile)) {
                missingFonts = findUnembeddedFontNames(doc);
                needImgs = (pdfaPart == 1) && hasTransparentImages(doc);
                if (!missingFonts.isEmpty() || needImgs) {
                    // Run LibreOffice conversion to get flattened images and embedded fonts
                    loPdfPath = runLibreOfficeConversion(preProcessedFile.toPath(), pdfaPart);
                }
            }
            fileBytes =
                    convertToPdfA(
                            preProcessedFile.toPath(), loPdfPath, pdfaPart, missingFonts, needImgs);

            String outputFilename = baseFileName + "_PDFA.pdf";

            return WebResponseUtils.bytesToWebResponse(
                    fileBytes, outputFilename, MediaType.APPLICATION_PDF);

        } finally {
            // Clean up temporary files
            if (tempInputFile != null) {
                Files.deleteIfExists(tempInputFile);
            }
            if (loPdfPath != null && loPdfPath.getParent() != null) {
                FileUtils.deleteDirectory(loPdfPath.getParent().toFile());
            }
            if (preProcessedFile != null) {
                Files.deleteIfExists(preProcessedFile.toPath());
            }
        }
    }

    /**
     * Merge fonts & flattened images from loPdfPath into basePdfPath, then run the standard
     * PDFBox/A pipeline.
     *
     * @param basePdfPath Path to the original (or highlight‐preprocessed) PDF
     * @param loPdfPath Path to the LibreOffice–flattened PDF/A, or null if not used
     * @param pdfaPart 1 (PDF/A-1B) or 2 (PDF/A-2B)
     * @return the final PDF/A bytes
     */
    private byte[] convertToPdfA(
            Path basePdfPath,
            Path loPdfPath,
            int pdfaPart,
            Set<String> missingFonts,
            boolean importImages)
            throws Exception {
        try (PDDocument baseDoc = Loader.loadPDF(basePdfPath.toFile())) {

            if (loPdfPath != null) {
                try (PDDocument loDoc = Loader.loadPDF(loPdfPath.toFile())) {
                    if (!missingFonts.isEmpty()) {
                        embedMissingFonts(loDoc, baseDoc, missingFonts);
                    }
                    if (importImages) {
                        importFlattenedImages(loDoc, baseDoc);
                    }
                }
            }
            return processWithPDFBox(baseDoc, pdfaPart);
        }
    }

    private byte[] processWithPDFBox(PDDocument document, int pdfaPart) throws Exception {

        removeElementsForPdfA(document, pdfaPart);

        mergeAndAddXmpMetadata(document, pdfaPart);

        addICCProfileIfNotPresent(document);

        // Mark the document as PDF/A
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        catalog.setMetadata(
                document.getDocumentCatalog().getMetadata()); // Ensure metadata is linked
        catalog.setViewerPreferences(
                new PDViewerPreferences(catalog.getCOSObject())); // PDF/A best practice
        document.getDocument().setVersion(pdfaPart == 1 ? 1.4f : 1.7f);

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        if (pdfaPart == 1) {
            document.save(baos, CompressParameters.NO_COMPRESSION);
        } else {
            document.save(baos);
        }

        return baos.toByteArray();
    }

    private Path runLibreOfficeConversion(Path tempInputFile, int pdfaPart) throws Exception {
        // Create temp output directory
        Path tempOutputDir = Files.createTempDirectory("output_");

        // Determine PDF/A filter based on requested format
        String pdfFilter =
                pdfaPart == 2
                        ? "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"2\"}}"
                        : "pdf:writer_pdf_Export:{\"SelectPdfVersion\":{\"type\":\"long\",\"value\":\"1\"}}";

        // Prepare LibreOffice command
        List<String> command =
                new ArrayList<>(
                        Arrays.asList(
                                "soffice",
                                "--headless",
                                "--nologo",
                                "--convert-to",
                                pdfFilter,
                                "--outdir",
                                tempOutputDir.toString(),
                                tempInputFile.toString()));

        ProcessExecutorResult returnCode =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                        .runCommandWithOutputHandling(command);

        if (returnCode.getRc() != 0) {
            log.error("PDF/A conversion failed with return code: {}", returnCode.getRc());
            throw ExceptionUtils.createPdfaConversionFailedException();
        }

        // Get the output file
        File[] outputFiles = tempOutputDir.toFile().listFiles();
        if (outputFiles == null || outputFiles.length != 1) {
            throw ExceptionUtils.createPdfaConversionFailedException();
        }
        return outputFiles[0].toPath();
    }

    private void embedMissingFonts(PDDocument loDoc, PDDocument baseDoc, Set<String> missingFonts)
            throws IOException {
        List<PDPage> loPages = new ArrayList<>();
        loDoc.getPages().forEach(loPages::add);
        List<PDPage> basePages = new ArrayList<>();
        baseDoc.getPages().forEach(basePages::add);

        for (int i = 0; i < loPages.size(); i++) {
            PDResources loRes = loPages.get(i).getResources();
            PDResources baseRes = basePages.get(i).getResources();

            for (COSName fontKey : loRes.getFontNames()) {
                PDFont loFont = loRes.getFont(fontKey);
                if (loFont == null) continue;

                String psName = loFont.getName();
                if (!missingFonts.contains(psName)) continue;

                PDFontDescriptor desc = loFont.getFontDescriptor();
                if (desc == null) continue;

                PDStream fontStream = null;
                if (desc.getFontFile() != null) {
                    fontStream = desc.getFontFile();
                } else if (desc.getFontFile2() != null) {
                    fontStream = desc.getFontFile2();
                } else if (desc.getFontFile3() != null) {
                    fontStream = desc.getFontFile3();
                }
                if (fontStream == null) continue;

                try (InputStream in = fontStream.createInputStream()) {
                    PDFont newFont = null;
                    try {
                        newFont = PDType0Font.load(baseDoc, in, false);
                    } catch (IOException e1) {
                        try {
                            newFont = PDTrueTypeFont.load(baseDoc, in, null);
                        } catch (IOException | IllegalArgumentException e2) {
                            log.error("Could not embed font {}: {}", psName, e2.getMessage());
                            continue;
                        }
                    }
                    if (newFont != null) {
                        baseRes.put(fontKey, newFont);
                    }
                }
            }
        }
    }

    private Set<String> findUnembeddedFontNames(PDDocument doc) throws IOException {
        Set<String> missing = new HashSet<>();
        for (PDPage page : doc.getPages()) {
            PDResources res = page.getResources();
            for (COSName name : res.getFontNames()) {
                PDFont font = res.getFont(name);
                if (font != null && !font.isEmbedded()) {
                    missing.add(font.getName());
                }
            }
        }
        return missing;
    }

    private void importFlattenedImages(PDDocument loDoc, PDDocument baseDoc) throws IOException {
        List<PDPage> loPages = new ArrayList<>();
        loDoc.getPages().forEach(loPages::add);
        List<PDPage> basePages = new ArrayList<>();
        baseDoc.getPages().forEach(basePages::add);

        for (int i = 0; i < loPages.size(); i++) {
            PDPage loPage = loPages.get(i);
            PDPage basePage = basePages.get(i);

            PDResources loRes = loPage.getResources();
            PDResources baseRes = basePage.getResources();
            Set<COSName> toReplace = detectTransparentXObjects(basePage);

            for (COSName name : toReplace) {
                PDXObject loXo = loRes.getXObject(name);
                if (!(loXo instanceof PDImageXObject img)) continue;

                PDImageXObject newImg = LosslessFactory.createFromImage(baseDoc, img.getImage());

                // replace the resource under the same name
                baseRes.put(name, newImg);
            }
        }
    }

    private Set<COSName> detectTransparentXObjects(PDPage page) {
        Set<COSName> transparentObjects = new HashSet<>();
        PDResources res = page.getResources();
        if (res == null) return transparentObjects;

        for (COSName name : res.getXObjectNames()) {
            try {
                PDXObject xo = res.getXObject(name);
                if (xo instanceof PDImageXObject img) {
                    COSDictionary d = img.getCOSObject();
                    if (d.containsKey(COSName.SMASK)
                            || isTransparencyGroup(d)
                            || d.getBoolean(COSName.INTERPOLATE, false)) {
                        transparentObjects.add(name);
                    }
                }
            } catch (IOException ioe) {
                log.error("Error processing XObject {}: {}", name.getName(), ioe.getMessage());
            }
        }
        return transparentObjects;
    }

    private boolean isTransparencyGroup(COSDictionary dict) {
        COSBase g = dict.getDictionaryObject(COSName.GROUP);
        return g instanceof COSDictionary gd
                && COSName.TRANSPARENCY.equals(gd.getCOSName(COSName.S));
    }

    private boolean hasTransparentImages(PDDocument doc) {
        for (PDPage page : doc.getPages()) {
            PDResources res = page.getResources();
            if (res == null) continue;
            for (COSName name : res.getXObjectNames()) {
                try {
                    PDXObject xo = res.getXObject(name);
                    if (xo instanceof PDImageXObject img) {
                        COSDictionary dict = img.getCOSObject();
                        if (dict.containsKey(COSName.SMASK)) return true;
                        COSBase g = dict.getDictionaryObject(COSName.GROUP);
                        if (g instanceof COSDictionary gd
                                && COSName.TRANSPARENCY.equals(gd.getCOSName(COSName.S))) {
                            return true;
                        }
                        if (dict.getBoolean(COSName.INTERPOLATE, false)) return true;
                    }
                } catch (IOException ioe) {
                    log.error("Error processing XObject {}: {}", name.getName(), ioe.getMessage());
                }
            }
        }
        return false;
    }

    private void sanitizePdfA(COSBase base, PDResources resources, int pdfaPart) {
        if (base instanceof COSDictionary dict) {
            if (pdfaPart == 1) {
                // Remove transparency-related elements
                COSBase group = dict.getDictionaryObject(COSName.GROUP);
                if (group instanceof COSDictionary gDict
                        && COSName.TRANSPARENCY.equals(gDict.getCOSName(COSName.S))) {
                    dict.removeItem(COSName.GROUP);
                }

                dict.removeItem(COSName.SMASK);
                // Transparency blending constants (/CA, /ca) — disallowed in PDF/A-1
                dict.removeItem(COSName.CA);
                dict.removeItem(COSName.getPDFName("ca"));
            }

            // Interpolation (non-deterministic image scaling) — required to be false
            if (dict.containsKey(COSName.INTERPOLATE)
                    && dict.getBoolean(COSName.INTERPOLATE, true)) {
                dict.setBoolean(COSName.INTERPOLATE, false);
            }

            // Remove common forbidden features (for PDF/A 1 and 2)
            dict.removeItem(COSName.JAVA_SCRIPT);
            dict.removeItem(COSName.getPDFName("JS"));
            dict.removeItem(COSName.getPDFName("RichMedia"));
            dict.removeItem(COSName.getPDFName("Movie"));
            dict.removeItem(COSName.getPDFName("Sound"));
            dict.removeItem(COSName.getPDFName("Launch"));
            dict.removeItem(COSName.URI);
            dict.removeItem(COSName.getPDFName("GoToR"));
            dict.removeItem(COSName.EMBEDDED_FILES);
            dict.removeItem(COSName.FILESPEC);

            // Recurse through all entries in the dictionary
            for (Map.Entry<COSName, COSBase> entry : dict.entrySet()) {
                sanitizePdfA(entry.getValue(), resources, pdfaPart);
            }

        } else if (base instanceof COSArray arr) {
            // Recursively sanitize each item in the array
            for (COSBase item : arr) {
                sanitizePdfA(item, resources, pdfaPart);
            }
        }
    }

    private void removeElementsForPdfA(PDDocument doc, int pdfaPart) {

        if (pdfaPart == 1) {
            // Remove Optional Content (Layers) - not allowed in PDF/A-1
            doc.getDocumentCatalog().getCOSObject().removeItem(COSName.getPDFName("OCProperties"));
        }

        for (PDPage page : doc.getPages()) {
            if (pdfaPart == 1) {
                page.setAnnotations(Collections.emptyList());
            }
            PDResources res = page.getResources();
            // Clean page-level dictionary
            sanitizePdfA(page.getCOSObject(), res, pdfaPart);

            // sanitize each Form XObject
            if (res != null) {
                for (COSName name : res.getXObjectNames()) {
                    try {
                        PDXObject xo = res.getXObject(name);
                        if (xo instanceof PDFormXObject form) {
                            sanitizePdfA(form.getCOSObject(), res, pdfaPart);
                        } else if (xo instanceof PDImageXObject img) {
                            sanitizePdfA(img.getCOSObject(), res, pdfaPart);
                        }
                    } catch (IOException ioe) {
                        log.error("Cannot load XObject {}: {}", name.getName(), ioe.getMessage());
                    }
                }
            }
        }
    }

    /** Embbeds the XMP metadata required for PDF/A compliance. */
    private void mergeAndAddXmpMetadata(PDDocument document, int pdfaPart) throws Exception {
        PDMetadata existingMetadata = document.getDocumentCatalog().getMetadata();
        XMPMetadata xmp;

        // Load existing XMP if available
        if (existingMetadata != null) {
            try (InputStream xmpStream = existingMetadata.createInputStream()) {
                DomXmpParser parser = new DomXmpParser();
                parser.setStrictParsing(false);
                xmp = parser.parse(xmpStream);
            } catch (Exception e) {
                xmp = XMPMetadata.createXMPMetadata();
            }
        } else {
            xmp = XMPMetadata.createXMPMetadata();
        }

        PDDocumentInformation docInfo = document.getDocumentInformation();
        if (docInfo == null) {
            docInfo = new PDDocumentInformation();
        }

        String originalCreator = Optional.ofNullable(docInfo.getCreator()).orElse("Unknown");
        String originalProducer = Optional.ofNullable(docInfo.getProducer()).orElse("Unknown");

        // Only keep the original creator so it can match xmp creator tool for compliance
        DublinCoreSchema dcSchema = xmp.getDublinCoreSchema();
        if (dcSchema != null) {
            List<String> existingCreators = dcSchema.getCreators();
            if (existingCreators != null) {
                for (String creator : new ArrayList<>(existingCreators)) {
                    dcSchema.removeCreator(creator);
                }
            }
        } else {
            dcSchema = xmp.createAndAddDublinCoreSchema();
        }
        dcSchema.addCreator(originalCreator);

        PDFAIdentificationSchema pdfaSchema =
                (PDFAIdentificationSchema) xmp.getSchema(PDFAIdentificationSchema.class);
        if (pdfaSchema == null) {
            pdfaSchema = xmp.createAndAddPDFAIdentificationSchema();
        }
        pdfaSchema.setPart(pdfaPart);
        pdfaSchema.setConformance("B");

        XMPBasicSchema xmpBasicSchema = xmp.getXMPBasicSchema();
        if (xmpBasicSchema == null) {
            xmpBasicSchema = xmp.createAndAddXMPBasicSchema();
        }

        AdobePDFSchema adobePdfSchema = xmp.getAdobePDFSchema();
        if (adobePdfSchema == null) {
            adobePdfSchema = xmp.createAndAddAdobePDFSchema();
        }

        docInfo.setCreator(originalCreator);
        xmpBasicSchema.setCreatorTool(originalCreator);

        docInfo.setProducer(originalProducer);
        adobePdfSchema.setProducer(originalProducer);

        String originalAuthor = docInfo.getAuthor();
        if (originalAuthor != null && !originalAuthor.isBlank()) {
            docInfo.setAuthor(null);
            // If the author is set, we keep it in the XMP metadata
            if (!originalCreator.equals(originalAuthor)) {
                dcSchema.addCreator(originalAuthor);
            }
        }

        String title = docInfo.getTitle();
        if (title != null && !title.isBlank()) {
            dcSchema.setTitle(title);
        }
        String subject = docInfo.getSubject();
        if (subject != null && !subject.isBlank()) {
            dcSchema.addSubject(subject);
        }
        String keywords = docInfo.getKeywords();
        if (keywords != null && !keywords.isBlank()) {
            adobePdfSchema.setKeywords(keywords);
        }

        // Set creation and modification dates
        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        Calendar originalCreationDate = docInfo.getCreationDate();
        if (originalCreationDate == null) {
            originalCreationDate = now;
        }
        docInfo.setCreationDate(originalCreationDate);
        xmpBasicSchema.setCreateDate(originalCreationDate);

        docInfo.setModificationDate(now);
        xmpBasicSchema.setModifyDate(now);
        xmpBasicSchema.setMetadataDate(now);

        // Serialize the created metadata so it can be attached to the existent metadata
        ByteArrayOutputStream xmpOut = new ByteArrayOutputStream();
        new XmpSerializer().serialize(xmp, xmpOut, true);

        PDMetadata newMetadata = new PDMetadata(document);
        newMetadata.importXMPMetadata(xmpOut.toByteArray());
        document.getDocumentCatalog().setMetadata(newMetadata);
    }

    private void addICCProfileIfNotPresent(PDDocument document) throws Exception {
        if (document.getDocumentCatalog().getOutputIntents().isEmpty()) {
            try (InputStream colorProfile = getClass().getResourceAsStream("/icc/sRGB2014.icc")) {
                PDOutputIntent outputIntent = new PDOutputIntent(document, colorProfile);
                outputIntent.setInfo("sRGB IEC61966-2.1");
                outputIntent.setOutputCondition("sRGB IEC61966-2.1");
                outputIntent.setOutputConditionIdentifier("sRGB IEC61966-2.1");
                outputIntent.setRegistryName("http://www.color.org");
                document.getDocumentCatalog().addOutputIntent(outputIntent);
            } catch (Exception e) {
                log.error("Failed to load ICC profile: {}", e.getMessage());
            }
        }
    }

    private File preProcessHighlights(File inputPdf) throws Exception {

        try (PDDocument document = Loader.loadPDF(inputPdf)) {

            for (PDPage page : document.getPages()) {
                // Retrieve the annotations on the page.
                List<PDAnnotation> annotations = page.getAnnotations();
                for (PDAnnotation annot : annotations) {
                    // Process only highlight annotations.
                    if ("Highlight".equals(annot.getSubtype())
                            && annot instanceof PDAnnotationTextMarkup highlight) {
                        // Create a new appearance stream with the same bounding box.
                        float[] colorComponents =
                                highlight.getColor() != null
                                        ? highlight.getColor().getComponents()
                                        : new float[] {1f, 1f, 0f};
                        Color highlightColor =
                                new Color(
                                        colorComponents[0], colorComponents[1], colorComponents[2]);

                        float[] quadPoints = highlight.getQuadPoints();
                        if (quadPoints != null) {
                            try (PDPageContentStream cs =
                                    new PDPageContentStream(
                                            document,
                                            page,
                                            PDPageContentStream.AppendMode.PREPEND,
                                            true,
                                            true)) {

                                cs.setStrokingColor(highlightColor);
                                cs.setLineWidth(0.05f);
                                float spacing = 2f;
                                // Draw diagonal lines across the highlight area to simulate
                                // transparency.
                                for (int i = 0; i < quadPoints.length; i += 8) {
                                    float minX =
                                            Math.min(
                                                    Math.min(quadPoints[i], quadPoints[i + 2]),
                                                    Math.min(quadPoints[i + 4], quadPoints[i + 6]));
                                    float maxX =
                                            Math.max(
                                                    Math.max(quadPoints[i], quadPoints[i + 2]),
                                                    Math.max(quadPoints[i + 4], quadPoints[i + 6]));
                                    float minY =
                                            Math.min(
                                                    Math.min(quadPoints[i + 1], quadPoints[i + 3]),
                                                    Math.min(quadPoints[i + 5], quadPoints[i + 7]));
                                    float maxY =
                                            Math.max(
                                                    Math.max(quadPoints[i + 1], quadPoints[i + 3]),
                                                    Math.max(quadPoints[i + 5], quadPoints[i + 7]));

                                    float width = maxX - minX;
                                    float height = maxY - minY;

                                    for (float y = minY; y <= maxY; y += spacing) {
                                        float len = Math.min(width, maxY - y);
                                        cs.moveTo(minX, y);
                                        cs.lineTo(minX + len, y + len);
                                    }
                                    for (float x = minX + spacing; x <= maxX; x += spacing) {
                                        float len = Math.min(maxX - x, height);
                                        cs.moveTo(x, minY);
                                        cs.lineTo(x + len, minY + len);
                                    }
                                }

                                cs.stroke();
                            }
                        }

                        page.getAnnotations().remove(highlight);
                        COSDictionary pageDict = page.getCOSObject();

                        if (pageDict.containsKey(COSName.GROUP)) {
                            COSDictionary groupDict =
                                    (COSDictionary) pageDict.getDictionaryObject(COSName.GROUP);

                            if (groupDict != null) {
                                if (COSName.TRANSPARENCY
                                        .getName()
                                        .equalsIgnoreCase(groupDict.getNameAsString(COSName.S))) {
                                    pageDict.removeItem(COSName.GROUP);
                                }
                            }
                        }
                    }
                }
            }
            // Save the modified document to a temporary file.
            File preProcessedFile = Files.createTempFile("preprocessed_", ".pdf").toFile();
            document.save(preProcessedFile);
            return preProcessedFile;
        }
    }
}
