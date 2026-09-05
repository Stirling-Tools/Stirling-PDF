package stirling.software.SPDF.service;

import static stirling.software.common.util.AttachmentUtils.setCatalogViewerPreferences;

import java.io.IOException;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PageMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.ExceptionUtils;

@Slf4j
@Service
public class PortfolioService implements PortfolioServiceInterface {

    private static final COSName COLLECTION = COSName.getPDFName("Collection");
    private static final COSName COLLECTION_SCHEMA = COSName.getPDFName("CollectionSchema");
    private static final COSName COLLECTION_FIELD = COSName.getPDFName("CollectionField");
    private static final COSName KEY_N = COSName.getPDFName("N");
    private static final COSName KEY_O = COSName.getPDFName("O");
    private static final COSName KEY_D = COSName.getPDFName("D");

    @Override
    public boolean isPortfolio(PDDocument document) {
        if (document == null) {
            return false;
        }
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog == null) {
            return false;
        }
        return catalog.getCOSObject().getDictionaryObject(COLLECTION) instanceof COSDictionary;
    }

    @Override
    public PDDocument createPortfolio(List<MultipartFile> files, String coverTitle)
            throws IOException {
        if (files == null || files.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.portfolioFilesRequired", "At least one file is required");
        }

        PDDocument document = new PDDocument();
        String title = StringUtils.isNotBlank(coverTitle) ? coverTitle : "PDF Portfolio";
        addCoverPage(document, title, files.size());

        PDEmbeddedFilesNameTreeNode embeddedFilesTree = getEmbeddedFilesTree(document);
        Map<String, PDComplexFileSpecification> names = new HashMap<>();

        GregorianCalendar now =
                GregorianCalendar.from(
                        ZonedDateTime.ofInstant(Instant.now(), ZoneId.systemDefault()));

        String firstFileName = null;
        for (MultipartFile file : files) {
            String filename = resolveFilename(file, names.size());
            PDEmbeddedFile embeddedFile = new PDEmbeddedFile(document, file.getInputStream());
            embeddedFile.setSize((int) file.getSize());
            embeddedFile.setCreationDate(now);
            embeddedFile.setModDate(now);
            String contentType = file.getContentType();
            if (StringUtils.isNotBlank(contentType)) {
                embeddedFile.setSubtype(contentType);
            }

            PDComplexFileSpecification fileSpecification = new PDComplexFileSpecification();
            fileSpecification.setFile(filename);
            fileSpecification.setFileUnicode(filename);
            fileSpecification.setFileDescription("Portfolio item: " + filename);
            fileSpecification.setEmbeddedFile(embeddedFile);
            fileSpecification.setEmbeddedFileUnicode(embeddedFile);

            names.put(filename, fileSpecification);
            if (firstFileName == null) {
                firstFileName = filename;
            }
            log.info("Added portfolio item: {} ({} bytes)", filename, file.getSize());
        }

        embeddedFilesTree.setNames(names);

        addCollectionDictionary(document, firstFileName);
        // Some viewers fall back to the attachments pane when they cannot render the collection UI.
        setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);

        return document;
    }

    @Override
    public PDDocument flattenPortfolio(PDDocument document) {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog != null) {
            catalog.getCOSObject().removeItem(COLLECTION);
        }
        // Keep the embedded files visible now that the portfolio wrapper is gone.
        setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);
        log.info("Flattened portfolio into a standard PDF");
        return document;
    }

    private void addCoverPage(PDDocument document, String title, int itemCount) throws IOException {
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);

        PDType1Font titleFont = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
        PDType1Font bodyFont = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(titleFont, 24);
            cs.newLineAtOffset(60, 760);
            cs.showText(toWinAnsiSafe(title));
            cs.endText();

            cs.beginText();
            cs.setFont(bodyFont, 12);
            cs.newLineAtOffset(60, 720);
            cs.showText("This document is a PDF Portfolio containing " + itemCount + " file(s).");
            cs.endText();

            cs.beginText();
            cs.setFont(bodyFont, 12);
            cs.newLineAtOffset(60, 700);
            cs.showText("Open it in a viewer that supports portfolios to browse the files.");
            cs.endText();
        }
    }

    private void addCollectionDictionary(PDDocument document, String initialDocument) {
        COSDictionary collection = new COSDictionary();
        collection.setItem(COSName.TYPE, COLLECTION);
        // Details view shows the files as a sortable table.
        collection.setName(COSName.getPDFName("View"), "D");
        if (StringUtils.isNotBlank(initialDocument)) {
            collection.setString(KEY_D, initialDocument);
        }

        COSDictionary schema = new COSDictionary();
        schema.setItem(COSName.TYPE, COLLECTION_SCHEMA);
        // Fields with these subtypes are populated by the viewer from each file specification.
        schema.setItem("Name", collectionField("F", "Name", 0));
        schema.setItem("Description", collectionField("Desc", "Description", 1));
        schema.setItem("Size", collectionField("Size", "Size", 2));
        schema.setItem("ModDate", collectionField("ModDate", "Modified", 3));
        collection.setItem(COSName.getPDFName("Schema"), schema);

        document.getDocumentCatalog().getCOSObject().setItem(COLLECTION, collection);
    }

    private COSDictionary collectionField(String subtype, String displayName, int order) {
        COSDictionary field = new COSDictionary();
        field.setItem(COSName.TYPE, COLLECTION_FIELD);
        field.setName(COSName.SUBTYPE, subtype);
        field.setString(KEY_N, displayName);
        field.setInt(KEY_O, order);
        field.setBoolean(COSName.getPDFName("V"), true);
        return field;
    }

    private String resolveFilename(MultipartFile file, int index) {
        String filename = Filenames.toSimpleFileName(file.getOriginalFilename());
        if (StringUtils.isBlank(filename)) {
            filename = "file_" + (index + 1);
        }
        return filename;
    }

    private String toWinAnsiSafe(String text) {
        StringBuilder sb = new StringBuilder(text.length());
        for (char c : text.toCharArray()) {
            sb.append(c <= 0xFF ? c : '?');
        }
        return sb.toString();
    }

    private PDEmbeddedFilesNameTreeNode getEmbeddedFilesTree(PDDocument document) {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        PDDocumentNameDictionary documentNames = catalog.getNames();
        if (documentNames == null) {
            documentNames = new PDDocumentNameDictionary(catalog);
        }
        catalog.setNames(documentNames);

        PDEmbeddedFilesNameTreeNode embeddedFilesTree = documentNames.getEmbeddedFiles();
        if (embeddedFilesTree == null) {
            embeddedFilesTree = new PDEmbeddedFilesNameTreeNode();
            documentNames.setEmbeddedFiles(embeddedFilesTree);
        }
        return embeddedFilesTree;
    }
}
