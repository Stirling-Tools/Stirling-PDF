package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.cos.COSInputStream;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.PDEncryption;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.optionalcontent.PDOptionalContentGroup;
import org.apache.pdfbox.pdmodel.graphics.optionalcontent.PDOptionalContentProperties;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationFileAttachment;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineNode;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.preflight.PreflightDocument;
import org.apache.pdfbox.preflight.ValidationResult;
import org.apache.pdfbox.preflight.exception.SyntaxValidationException;
import org.apache.pdfbox.preflight.exception.ValidationException;
import org.apache.pdfbox.preflight.parser.PreflightParser;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.PDFAIdentificationSchema;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpParsingException;
import org.apache.xmpbox.xml.XmpSerializer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Slf4j
@Tag(name = "Security", description = "Security APIs")
@RequiredArgsConstructor
public class GetInfoOnPDF {

    private static final int DEFAULT_PPI = 72;
    private static final float SIZE_TOLERANCE = 1.0f;
    private static final int MAX_LOGGED_ERRORS = 5;
    private static final String PAGE_PREFIX = "Page ";
    private static final long MAX_FILE_SIZE = 100L * 1024 * 1024;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    private static void addOutlinesToArray(PDOutlineItem outline, ArrayNode arrayNode) {
        if (outline == null) return;

        ObjectNode outlineNode = objectMapper.createObjectNode();
        outlineNode.put("Title", outline.getTitle());
        // You can add other properties if needed
        arrayNode.add(outlineNode);

        PDOutlineItem child = outline.getFirstChild();
        while (child != null) {
            addOutlinesToArray(child, arrayNode);
            child = child.getNextSibling();
        }
    }

    public static boolean checkForStandard(PDDocument document, String standardKeyword) {
        if ("PDF/A".equalsIgnoreCase(standardKeyword)) {
            return getPdfAConformanceLevel(document) != null;
        }

        return checkStandardInMetadata(document, standardKeyword);
    }

    public static String getPdfAConformanceLevel(PDDocument document) {
        if (document == null || document.isEncrypted()) {
            return null;
        }

        return getPdfAVersionFromMetadata(document);
    }

    private static String getPdfAVersionFromMetadata(PDDocument document) {
        try {
            PDMetadata pdMetadata = document.getDocumentCatalog().getMetadata();
            if (pdMetadata != null) {
                try (COSInputStream metaStream = pdMetadata.createInputStream()) {
                    DomXmpParser domXmpParser = new DomXmpParser();
                    XMPMetadata xmpMeta = domXmpParser.parse(metaStream);

                    PDFAIdentificationSchema pdfId = xmpMeta.getPDFAIdentificationSchema();
                    if (pdfId != null) {
                        Integer part = pdfId.getPart();
                        String conformance = pdfId.getConformance();

                        if (part != null && conformance != null) {
                            return part + conformance.toUpperCase(Locale.ROOT);
                        }
                    } else {
                        try (COSInputStream rawStream = pdMetadata.createInputStream()) {
                            byte[] metadataBytes = rawStream.readAllBytes();
                            String rawMetadata = new String(metadataBytes, StandardCharsets.UTF_8);
                            String extracted = extractPdfAVersionFromRawXml(rawMetadata);
                            if (extracted != null) {
                                return extracted;
                            }
                        }
                    }
                } catch (XmpParsingException e) {
                    log.debug("XMP parsing failed, trying raw metadata search: {}", e.getMessage());
                    try (COSInputStream metaStream = pdMetadata.createInputStream()) {
                        byte[] metadataBytes = metaStream.readAllBytes();
                        String rawMetadata = new String(metadataBytes, StandardCharsets.UTF_8);
                        String extracted = extractPdfAVersionFromRawXml(rawMetadata);
                        if (extracted != null) {
                            return extracted;
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug("Error reading PDF/A metadata: {}", e.getMessage());
        }

        return null;
    }

    private static String extractPdfAVersionFromRawXml(String rawXml) {
        if (rawXml == null || rawXml.isEmpty()) {
            return null;
        }

        try {
            Pattern partPattern = RegexPatternUtils.getInstance().getPdfAidPartPattern();
            Pattern confPattern = RegexPatternUtils.getInstance().getPdfAidConformancePattern();

            Matcher partMatcher = partPattern.matcher(rawXml);
            Matcher confMatcher = confPattern.matcher(rawXml);

            if (partMatcher.find() && confMatcher.find()) {
                String part = partMatcher.group(1);
                String conformance = confMatcher.group(1).toUpperCase(Locale.ROOT);
                return part + conformance;
            }
        } catch (Exception e) {
            log.debug("Error parsing raw XMP for PDF/A version: {}", e.getMessage());
        }

        return null;
    }

    private static boolean validatePdfAWithPreflight(PDDocument document, String version) {
        if (document == null || document.isEncrypted()) {
            return false;
        }

        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            document.save(baos);

            try (RandomAccessReadBuffer source = new RandomAccessReadBuffer(baos.toByteArray())) {
                PreflightParser parser = new PreflightParser(source);

                try (PDDocument parsedDocument = parser.parse()) {
                    if (!(parsedDocument instanceof PreflightDocument preflightDocument)) {
                        log.debug(
                                "Parsed document is not a PreflightDocument; unable to validate claimed PDF/A {}",
                                version);
                        return false;
                    }

                    try {
                        ValidationResult result = preflightDocument.validate();
                        if (!result.isValid() && log.isDebugEnabled()) {
                            log.debug(
                                    "PDF/A validation found {} errors for claimed version {}",
                                    result.getErrorsList().size(),
                                    version);
                            int logged = 0;
                            for (ValidationResult.ValidationError error : result.getErrorsList()) {
                                log.debug(
                                        "  Error {}: {}", error.getErrorCode(), error.getDetails());
                                if (++logged >= MAX_LOGGED_ERRORS) {
                                    break;
                                }
                            }
                        }
                        return result.isValid();
                    } catch (ValidationException e) {
                        log.debug(
                                "Validation exception during PDF/A validation: {}", e.getMessage());
                    }
                } catch (SyntaxValidationException e) {
                    log.debug(
                            "Syntax validation failed during PDF/A validation: {}", e.getMessage());
                    return false;
                }
            }
        } catch (IOException e) {
            log.debug("IOException during PDF/A validation: {}", e.getMessage());
        } catch (Exception e) {
            log.debug("Unexpected error during PDF/A validation: {}", e.getMessage());
        }

        return false;
    }

    private static boolean checkStandardInMetadata(PDDocument document, String standardKeyword) {
        // Check XMP Metadata
        try {
            PDMetadata pdMetadata = document.getDocumentCatalog().getMetadata();
            if (pdMetadata != null) {
                try (COSInputStream metaStream = pdMetadata.createInputStream()) {
                    // First try to read raw metadata as string to check for standard keywords
                    byte[] metadataBytes = metaStream.readAllBytes();
                    String rawMetadata = new String(metadataBytes, StandardCharsets.UTF_8);

                    if (rawMetadata.contains(standardKeyword)) {
                        return true;
                    }
                }

                // If raw check doesn't find it, try parsing with XMP parser
                try (COSInputStream metaStream = pdMetadata.createInputStream()) {
                    try {
                        DomXmpParser domXmpParser = new DomXmpParser();
                        XMPMetadata xmpMeta = domXmpParser.parse(metaStream);

                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        new XmpSerializer().serialize(xmpMeta, baos, true);
                        String xmpString = baos.toString(StandardCharsets.UTF_8);

                        if (xmpString.contains(standardKeyword)) {
                            return true;
                        }
                    } catch (XmpParsingException e) {
                        // XMP parsing failed, but we already checked raw metadata above
                        log.debug(
                                "XMP parsing failed for standard check, but raw metadata was already checked: {}",
                                e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            ExceptionUtils.logException("PDF standard checking", e);
        }

        return false;
    }

    private static ObjectNode generatePDFSummaryData(
            PDDocument document, String pdfaConformanceLevel, Boolean pdfaValidationPassed) {
        ObjectNode summaryData = objectMapper.createObjectNode();

        // Check if encrypted
        if (document.isEncrypted()) {
            summaryData.put("encrypted", true);
        }

        // Check permissions
        AccessPermission accessPermission = document.getCurrentAccessPermission();
        ArrayNode restrictedPermissions = objectMapper.createArrayNode();

        if (!accessPermission.canAssembleDocument()) restrictedPermissions.add("document assembly");
        if (!accessPermission.canExtractContent()) restrictedPermissions.add("content extraction");
        if (!accessPermission.canExtractForAccessibility())
            restrictedPermissions.add("accessibility extraction");
        if (!accessPermission.canFillInForm()) restrictedPermissions.add("form filling");
        if (!accessPermission.canModify()) restrictedPermissions.add("modification");
        if (!accessPermission.canModifyAnnotations())
            restrictedPermissions.add("annotation modification");
        if (!accessPermission.canPrint()) restrictedPermissions.add("printing");

        if (!restrictedPermissions.isEmpty()) {
            summaryData.set("restrictedPermissions", restrictedPermissions);
            summaryData.put("restrictedPermissionsCount", restrictedPermissions.size());
        }

        // Check standard compliance
        if (pdfaConformanceLevel != null) {
            summaryData.put("standardCompliance", "PDF/A-" + pdfaConformanceLevel);
            summaryData.put("standardPurpose", "long-term archiving");
            if (pdfaValidationPassed != null) {
                summaryData.put("standardValidationPassed", pdfaValidationPassed);
            }
        } else if (checkForStandard(document, "PDF/X")) {
            summaryData.put("standardCompliance", "PDF/X");
            summaryData.put("standardPurpose", "graphic exchange");
        } else if (checkForStandard(document, "PDF/UA")) {
            summaryData.put("standardCompliance", "PDF/UA");
            summaryData.put("standardPurpose", "universal accessibility");
        } else if (checkForStandard(document, "PDF/E")) {
            summaryData.put("standardCompliance", "PDF/E");
            summaryData.put("standardPurpose", "engineering workflows");
        } else if (checkForStandard(document, "PDF/VT")) {
            summaryData.put("standardCompliance", "PDF/VT");
            summaryData.put("standardPurpose", "variable and transactional printing");
        }

        return summaryData;
    }

    private static void setNodePermissions(PDDocument pdfBoxDoc, ObjectNode permissionsNode) {
        AccessPermission accessPermission = pdfBoxDoc.getCurrentAccessPermission();

        permissionsNode.put(
                "Document Assembly", getPermissionState(accessPermission.canAssembleDocument()));
        permissionsNode.put(
                "Extracting Content", getPermissionState(accessPermission.canExtractContent()));
        permissionsNode.put(
                "Extracting for accessibility",
                getPermissionState(accessPermission.canExtractForAccessibility()));
        permissionsNode.put("Form Filling", getPermissionState(accessPermission.canFillInForm()));
        permissionsNode.put("Modifying", getPermissionState(accessPermission.canModify()));
        permissionsNode.put(
                "Modifying annotations",
                getPermissionState(accessPermission.canModifyAnnotations()));
        permissionsNode.put("Printing", getPermissionState(accessPermission.canPrint()));
    }

    private static String getPermissionState(boolean state) {
        return state ? "Allowed" : "Not Allowed";
    }

    public static String getPageOrientation(double width, double height) {
        if (width > height) {
            return "Landscape";
        } else if (height > width) {
            return "Portrait";
        } else {
            return "Square";
        }
    }

    public static String getPageSize(float width, float height) {
        // Define standard page sizes
        Map<String, PDRectangle> standardSizes = new HashMap<>();
        standardSizes.put("Letter", PDRectangle.LETTER);
        standardSizes.put("LEGAL", PDRectangle.LEGAL);
        standardSizes.put("A0", PDRectangle.A0);
        standardSizes.put("A1", PDRectangle.A1);
        standardSizes.put("A2", PDRectangle.A2);
        standardSizes.put("A3", PDRectangle.A3);
        standardSizes.put("A4", PDRectangle.A4);
        standardSizes.put("A5", PDRectangle.A5);
        standardSizes.put("A6", PDRectangle.A6);

        for (Map.Entry<String, PDRectangle> entry : standardSizes.entrySet()) {
            PDRectangle size = entry.getValue();
            if (isCloseToSize(width, height, size.getWidth(), size.getHeight())) {
                return entry.getKey();
            }
        }
        return "Custom";
    }

    private static boolean isCloseToSize(
            float width, float height, float standardWidth, float standardHeight) {
        return Math.abs(width - standardWidth) <= SIZE_TOLERANCE
                && Math.abs(height - standardHeight) <= SIZE_TOLERANCE;
    }

    private static void setDimensionInfo(ObjectNode dimensionInfo, float width, float height) {
        float widthInInches = width / DEFAULT_PPI;
        float heightInInches = height / DEFAULT_PPI;

        float widthInCm = widthInInches * 2.54f;
        float heightInCm = heightInInches * 2.54f;

        dimensionInfo.put("Width (px)", String.format("%.2f", width));
        dimensionInfo.put("Height (px)", String.format("%.2f", height));
        dimensionInfo.put("Width (in)", String.format("%.2f", widthInInches));
        dimensionInfo.put("Height (in)", String.format("%.2f", heightInInches));
        dimensionInfo.put("Width (cm)", String.format("%.2f", widthInCm));
        dimensionInfo.put("Height (cm)", String.format("%.2f", heightInCm));
    }

    private static ArrayNode exploreStructureTree(List<Object> nodes) {
        ArrayNode elementsArray = objectMapper.createArrayNode();
        if (nodes != null) {
            for (Object obj : nodes) {
                if (obj instanceof PDStructureNode node) {
                    ObjectNode elementNode = objectMapper.createObjectNode();

                    if (node instanceof PDStructureElement structureElement) {
                        elementNode.put("Type", structureElement.getStructureType());
                        elementNode.put("Content", getContent(structureElement));

                        // Recursively explore child elements
                        ArrayNode childElements = exploreStructureTree(structureElement.getKids());
                        if (!childElements.isEmpty()) {
                            elementNode.set("Children", childElements);
                        }
                    }
                    elementsArray.add(elementNode);
                }
            }
        }
        return elementsArray;
    }

    private static String getContent(PDStructureElement structureElement) {
        StringBuilder contentBuilder = new StringBuilder();

        for (Object item : structureElement.getKids()) {
            if (item instanceof COSString cosString) {
                contentBuilder.append(cosString.getString());
            } else if (item instanceof PDStructureElement pdstructureelement) {
                // For simplicity, we're handling only COSString and PDStructureElement here
                // but a more comprehensive method would handle other types too
                contentBuilder.append(getContent(pdstructureelement));
            }
        }

        return contentBuilder.toString();
    }

    private static String formatDate(Instant instant) {
        if (instant != null) {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            ZonedDateTime zonedDateTime = instant.atZone(ZoneId.systemDefault());
            return zonedDateTime.format(formatter);
        } else {
            return null;
        }
    }

    private static void validatePdfFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("PDF file is required");
        }

        if (file.getSize() > MAX_FILE_SIZE) {
            throw new IllegalArgumentException(
                    String.format(
                            "File size (%d bytes) exceeds maximum allowed size (%d bytes)",
                            file.getSize(), MAX_FILE_SIZE));
        }

        String contentType = file.getContentType();
        if (contentType != null && !"application/pdf".equals(contentType)) {
            log.warn("File content type is {}, expected application/pdf", contentType);
        }
    }

    private static ResponseEntity<byte[]> createErrorResponse(String errorMessage) {
        try {
            ObjectNode errorNode = objectMapper.createObjectNode();
            errorNode.put("error", errorMessage);
            errorNode.put("timestamp", System.currentTimeMillis());

            String jsonString =
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(errorNode);
            return WebResponseUtils.bytesToWebResponse(
                    jsonString.getBytes(StandardCharsets.UTF_8),
                    "error.json",
                    MediaType.APPLICATION_JSON);
        } catch (Exception e) {
            log.error("Failed to create error response", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    private static ObjectNode extractMetadata(PDDocument document) {
        ObjectNode metadata = objectMapper.createObjectNode();

        try {
            PDDocumentInformation info = document.getDocumentInformation();
            if (info != null) {
                if (info.getTitle() != null) metadata.put("Title", info.getTitle());
                if (info.getAuthor() != null) metadata.put("Author", info.getAuthor());
                if (info.getSubject() != null) metadata.put("Subject", info.getSubject());
                if (info.getKeywords() != null) metadata.put("Keywords", info.getKeywords());
                if (info.getProducer() != null) metadata.put("Producer", info.getProducer());
                if (info.getCreator() != null) metadata.put("Creator", info.getCreator());

                String creationDate =
                        formatDate(
                                info.getCreationDate() != null
                                        ? info.getCreationDate().toInstant()
                                        : null);
                if (creationDate != null) {
                    metadata.put("CreationDate", creationDate);
                }

                String modificationDate =
                        formatDate(
                                info.getModificationDate() != null
                                        ? info.getModificationDate().toInstant()
                                        : null);
                if (modificationDate != null) {
                    metadata.put("ModificationDate", modificationDate);
                }
            }
        } catch (Exception e) {
            log.error("Error extracting metadata: {}", e.getMessage());
        }

        return metadata;
    }

    private static ObjectNode extractDocumentInfo(PDDocument document) {
        ObjectNode docInfoNode = objectMapper.createObjectNode();

        try {
            PDDocumentInformation info = document.getDocumentInformation();
            PDDocumentCatalog catalog = document.getDocumentCatalog();

            docInfoNode.put("PDF version", document.getVersion());
            if (info != null) {
                docInfoNode.put("Trapped", info.getTrapped());
            }

            String pageMode = catalog.getPageMode().name();
            docInfoNode.put("Page Mode", getPageModeDescription(pageMode));

        } catch (Exception e) {
            log.error("Error extracting document info: {}", e.getMessage());
        }

        return docInfoNode;
    }

    private static ObjectNode extractComplianceInfo(PDDocument document) {
        ObjectNode compliancy = objectMapper.createObjectNode();

        try {
            String pdfaConformanceLevel = getPdfAConformanceLevel(document);
            boolean isPdfACompliant = pdfaConformanceLevel != null;
            boolean isPdfXCompliant = checkForStandard(document, "PDF/X");
            boolean isPdfECompliant = checkForStandard(document, "PDF/E");
            boolean isPdfVTCompliant = checkForStandard(document, "PDF/VT");
            boolean isPdfUACompliant = checkForStandard(document, "PDF/UA");
            boolean isPdfBCompliant = checkForStandard(document, "PDF/B");
            boolean isPdfSECCompliant = checkForStandard(document, "PDF/SEC");

            compliancy.put("IsPDF/ACompliant", isPdfACompliant);
            if (pdfaConformanceLevel != null) {
                compliancy.put("PDF/AConformanceLevel", pdfaConformanceLevel);
                Boolean pdfaValidationPassed =
                        validatePdfAWithPreflight(document, pdfaConformanceLevel);
                compliancy.put("IsPDF/AValidated", pdfaValidationPassed);
            }
            compliancy.put("IsPDF/XCompliant", isPdfXCompliant);
            compliancy.put("IsPDF/ECompliant", isPdfECompliant);
            compliancy.put("IsPDF/VTCompliant", isPdfVTCompliant);
            compliancy.put("IsPDF/UACompliant", isPdfUACompliant);
            compliancy.put("IsPDF/BCompliant", isPdfBCompliant);
            compliancy.put("IsPDF/SECCompliant", isPdfSECCompliant);

        } catch (Exception e) {
            log.error("Error extracting compliance info: {}", e.getMessage());
        }

        return compliancy;
    }

    private static ObjectNode extractEncryptionInfo(PDDocument document) {
        ObjectNode encryption = objectMapper.createObjectNode();

        try {
            if (document.isEncrypted()) {
                encryption.put("IsEncrypted", true);

                PDEncryption pdfEncryption = document.getEncryption();
                if (pdfEncryption != null) {
                    encryption.put("EncryptionAlgorithm", pdfEncryption.getFilter());
                    encryption.put("KeyLength", pdfEncryption.getLength());
                    encryption.put("Version", pdfEncryption.getVersion());
                    encryption.put("Revision", pdfEncryption.getRevision());
                }
            } else {
                encryption.put("IsEncrypted", false);
            }
        } catch (Exception e) {
            log.error("Error extracting encryption info: {}", e.getMessage());
        }

        return encryption;
    }

    // Extracts permissions information
    private static ObjectNode extractPermissions(PDDocument document) {
        ObjectNode permissionsNode = objectMapper.createObjectNode();

        try {
            setNodePermissions(document, permissionsNode);
        } catch (Exception e) {
            log.error("Error extracting permissions: {}", e.getMessage());
        }

        return permissionsNode;
    }

    private static ObjectNode extractFormFields(PDDocument document) {
        ObjectNode formFieldsNode = objectMapper.createObjectNode();

        try {
            PDAcroForm acroForm = document.getDocumentCatalog().getAcroForm();
            if (acroForm != null) {
                for (PDField field : acroForm.getFieldTree()) {
                    formFieldsNode.put(field.getFullyQualifiedName(), field.getValueAsString());
                }
            }
        } catch (Exception e) {
            log.error("Error extracting form fields: {}", e.getMessage());
        }

        return formFieldsNode;
    }

    private static ObjectNode extractOtherInfo(PDDocument document) {
        ObjectNode other = objectMapper.createObjectNode();

        try {
            PDDocumentCatalog catalog = document.getDocumentCatalog();

            // Embedded files
            ArrayNode embeddedFilesArray = extractEmbeddedFiles(catalog);
            other.set("EmbeddedFiles", embeddedFilesArray);

            // Attachments
            ArrayNode attachmentsArray = extractAttachments(document);
            other.set("Attachments", attachmentsArray);

            // JavaScript with security analysis
            ArrayNode javascriptArray = extractJavaScript(catalog);
            other.set("JavaScript", javascriptArray);

            // Layers
            ArrayNode layersArray = extractLayers(document);
            other.set("Layers", layersArray);

            // Bookmarks
            ArrayNode bookmarksArray = extractBookmarks(document);
            other.set("Bookmarks/Outline/TOC", bookmarksArray);

            // XMP Metadata
            String xmpString = extractXMPMetadata(document);
            other.put("XMPMetadata", xmpString);

            // Structure tree
            try {
                PDStructureTreeRoot structureTreeRoot =
                        document.getDocumentCatalog().getStructureTreeRoot();
                if (structureTreeRoot != null) {
                    ArrayNode structureTreeArray =
                            exploreStructureTree(structureTreeRoot.getKids());
                    other.set("StructureTree", structureTreeArray);
                }
            } catch (Exception e) {
                log.error("Error extracting structure tree: {}", e.getMessage());
            }

        } catch (Exception e) {
            log.error("Error extracting other info: {}", e.getMessage());
        }

        return other;
    }

    private static ArrayNode extractEmbeddedFiles(PDDocumentCatalog catalog) {
        ArrayNode embeddedFilesArray = objectMapper.createArrayNode();

        try {
            if (catalog.getNames() != null) {
                PDEmbeddedFilesNameTreeNode efTree = catalog.getNames().getEmbeddedFiles();

                if (efTree != null) {
                    Map<String, PDComplexFileSpecification> efMap = efTree.getNames();
                    if (efMap != null) {
                        for (Map.Entry<String, PDComplexFileSpecification> entry :
                                efMap.entrySet()) {
                            ObjectNode embeddedFileNode = objectMapper.createObjectNode();
                            embeddedFileNode.put("Name", entry.getKey());

                            PDEmbeddedFile embeddedFile = entry.getValue().getEmbeddedFile();
                            if (embeddedFile != null) {
                                embeddedFileNode.put("FileSize", embeddedFile.getLength());
                                embeddedFileNode.put("MimeType", embeddedFile.getSubtype());
                                embeddedFileNode.put(
                                        "CreationDate",
                                        formatDate(
                                                embeddedFile.getCreationDate() != null
                                                        ? embeddedFile.getCreationDate().toInstant()
                                                        : null));
                                embeddedFileNode.put(
                                        "ModificationDate",
                                        formatDate(
                                                embeddedFile.getModDate() != null
                                                        ? embeddedFile.getModDate().toInstant()
                                                        : null));
                            }
                            embeddedFilesArray.add(embeddedFileNode);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error extracting embedded files: {}", e.getMessage());
        }

        return embeddedFilesArray;
    }

    private static ArrayNode extractAttachments(PDDocument document) {
        ArrayNode attachmentsArray = objectMapper.createArrayNode();

        try {
            for (PDPage page : document.getPages()) {
                for (PDAnnotation annotation : page.getAnnotations()) {
                    if (annotation instanceof PDAnnotationFileAttachment fileAttachmentAnnotation) {
                        ObjectNode attachmentNode = objectMapper.createObjectNode();
                        attachmentNode.put("Name", fileAttachmentAnnotation.getAttachmentName());
                        attachmentNode.put("Description", fileAttachmentAnnotation.getContents());

                        // Try to get file size
                        try {
                            PDComplexFileSpecification fileSpec =
                                    (PDComplexFileSpecification) fileAttachmentAnnotation.getFile();
                            if (fileSpec != null && fileSpec.getEmbeddedFile() != null) {
                                attachmentNode.put(
                                        "FileSize", fileSpec.getEmbeddedFile().getLength());
                            }
                        } catch (Exception e) {
                            log.debug("Could not get attachment file size: {}", e.getMessage());
                        }

                        attachmentsArray.add(attachmentNode);
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error extracting attachments: {}", e.getMessage());
        }

        return attachmentsArray;
    }

    private static ArrayNode extractJavaScript(PDDocumentCatalog catalog) {
        ArrayNode javascriptArray = objectMapper.createArrayNode();

        try {
            PDDocumentNameDictionary namesDict = catalog.getNames();
            if (namesDict != null) {
                PDJavascriptNameTreeNode javascriptDict = namesDict.getJavaScript();
                if (javascriptDict != null) {
                    try {
                        Map<String, PDActionJavaScript> jsEntries = javascriptDict.getNames();

                        for (Map.Entry<String, PDActionJavaScript> entry : jsEntries.entrySet()) {
                            ObjectNode jsNode = objectMapper.createObjectNode();
                            jsNode.put("JS Name", entry.getKey());

                            PDActionJavaScript jsAction = entry.getValue();
                            if (jsAction != null) {
                                String jsCodeStr = jsAction.getAction();
                                if (jsCodeStr != null) {
                                    jsNode.put("JS Script Length", jsCodeStr.length());
                                }
                            }

                            javascriptArray.add(jsNode);
                        }
                    } catch (IOException e) {
                        log.error("Error reading JavaScript entries: {}", e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error extracting JavaScript: {}", e.getMessage());
        }

        return javascriptArray;
    }

    private static ArrayNode extractLayers(PDDocument document) {
        ArrayNode layersArray = objectMapper.createArrayNode();

        try {
            PDOptionalContentProperties ocProperties =
                    document.getDocumentCatalog().getOCProperties();
            if (ocProperties != null) {
                for (PDOptionalContentGroup ocg : ocProperties.getOptionalContentGroups()) {
                    ObjectNode layerNode = objectMapper.createObjectNode();
                    layerNode.put("Name", ocg.getName());
                    layersArray.add(layerNode);
                }
            }
        } catch (Exception e) {
            log.error("Error extracting layers: {}", e.getMessage());
        }

        return layersArray;
    }

    private static ArrayNode extractBookmarks(PDDocument document) {
        ArrayNode bookmarksArray = objectMapper.createArrayNode();

        try {
            PDOutlineNode root = document.getDocumentCatalog().getDocumentOutline();
            if (root != null) {
                for (PDOutlineItem child : root.children()) {
                    addOutlinesToArray(child, bookmarksArray);
                }
            }
        } catch (Exception e) {
            log.error("Error extracting bookmarks: {}", e.getMessage());
        }

        return bookmarksArray;
    }

    private static String extractXMPMetadata(PDDocument document) {
        String xmpString = null;

        try {
            PDMetadata pdMetadata = document.getDocumentCatalog().getMetadata();
            if (pdMetadata != null) {
                try {
                    try (COSInputStream inputStream = pdMetadata.createInputStream()) {
                        DomXmpParser domXmpParser = new DomXmpParser();
                        XMPMetadata xmpMeta = domXmpParser.parse(inputStream);

                        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                        new XmpSerializer().serialize(xmpMeta, outputStream, true);
                        xmpString = outputStream.toString(StandardCharsets.UTF_8);
                    }
                } catch (XmpParsingException e) {
                    log.debug("XMP parsing failed, reading raw metadata: {}", e.getMessage());
                    try (COSInputStream inputStream = pdMetadata.createInputStream()) {
                        byte[] metadataBytes = inputStream.readAllBytes();
                        xmpString = new String(metadataBytes, StandardCharsets.UTF_8);
                    }
                }
            }
        } catch (Exception e) {
            log.error("Error extracting XMP metadata: {}", e.getMessage());
        }

        return xmpString;
    }

    private static ObjectNode extractPerPageInfo(PDDocument document) {
        ObjectNode pageInfoParent = objectMapper.createObjectNode();

        try {
            int pageCount = document.getNumberOfPages();
            StringBuilder keyBuilder = new StringBuilder(PAGE_PREFIX.length() + 8);

            for (int pageNum = 0; pageNum < pageCount; pageNum++) {
                try {
                    PDPage page = document.getPage(pageNum);
                    ObjectNode pageInfo = extractSinglePageInfo(document, page, pageNum);

                    keyBuilder.setLength(0);
                    keyBuilder.append(PAGE_PREFIX).append(pageNum + 1);
                    pageInfoParent.set(keyBuilder.toString(), pageInfo);
                } catch (Exception e) {
                    log.error("Error extracting info for page {}: {}", pageNum + 1, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Error extracting per-page info: {}", e.getMessage());
        }

        return pageInfoParent;
    }

    private static ObjectNode extractSinglePageInfo(PDDocument document, PDPage page, int pageNum)
            throws IOException {
        ObjectNode pageInfo = objectMapper.createObjectNode();

        // Page size and dimensions
        PDRectangle mediaBox = page.getMediaBox();
        float width = mediaBox.getWidth();
        float height = mediaBox.getHeight();

        ObjectNode sizeInfo = objectMapper.createObjectNode();
        setDimensionInfo(sizeInfo, width, height);
        sizeInfo.put("Standard Page", getPageSize(width, height));
        pageInfo.set("Size", sizeInfo);

        pageInfo.put("Rotation", page.getRotation());
        pageInfo.put("Page Orientation", getPageOrientation(width, height));

        // Page boxes
        pageInfo.put("MediaBox", mediaBox.toString());
        pageInfo.put(
                "CropBox", page.getCropBox() == null ? "Undefined" : page.getCropBox().toString());
        pageInfo.put(
                "BleedBox",
                page.getBleedBox() == null ? "Undefined" : page.getBleedBox().toString());
        pageInfo.put(
                "TrimBox", page.getTrimBox() == null ? "Undefined" : page.getTrimBox().toString());
        pageInfo.put(
                "ArtBox", page.getArtBox() == null ? "Undefined" : page.getArtBox().toString());

        // Text content
        PDFTextStripper textStripper = new PDFTextStripper();
        textStripper.setStartPage(pageNum + 1);
        textStripper.setEndPage(pageNum + 1);
        String pageText = textStripper.getText(document);
        pageInfo.put("Text Characters Count", pageText.length());

        // Annotations
        ObjectNode annotationsObject = extractPageAnnotations(page);
        pageInfo.set("Annotations", annotationsObject);

        // Resources
        PDResources resources = page.getResources();
        if (resources != null) {
            // Images
            ArrayNode imagesArray = extractPageImages(resources);
            pageInfo.set("Images", imagesArray);

            // Links
            ArrayNode linksArray = extractPageLinks(page);
            pageInfo.set("Links", linksArray);

            // Fonts
            ArrayNode fontsArray = extractPageFonts(resources);
            pageInfo.set("Fonts", fontsArray);

            // XObjects count
            ObjectNode xObjectCountNode = extractPageXObjects(resources);
            pageInfo.set("XObjectCounts", xObjectCountNode);
        }

        // Multimedia
        ArrayNode multimediaArray = extractPageMultimedia(page);
        pageInfo.set("Multimedia", multimediaArray);

        return pageInfo;
    }

    private static ObjectNode extractPageAnnotations(PDPage page) throws IOException {
        ObjectNode annotationsObject = objectMapper.createObjectNode();

        List<PDAnnotation> annotations = page.getAnnotations();
        int subtypeCount = 0;
        int contentsCount = 0;

        for (PDAnnotation annotation : annotations) {
            if (annotation.getSubtype() != null) {
                subtypeCount++;
            }
            if (annotation.getContents() != null) {
                contentsCount++;
            }
        }

        annotationsObject.put("AnnotationsCount", annotations.size());
        annotationsObject.put("SubtypeCount", subtypeCount);
        annotationsObject.put("ContentsCount", contentsCount);

        return annotationsObject;
    }

    private static ArrayNode extractPageImages(PDResources resources) {
        ArrayNode imagesArray = objectMapper.createArrayNode();

        try {
            for (COSName name : resources.getXObjectNames()) {
                PDXObject xObject = resources.getXObject(name);
                if (xObject instanceof PDImageXObject image) {
                    ObjectNode imageNode = objectMapper.createObjectNode();
                    imageNode.put("Width", image.getWidth());
                    imageNode.put("Height", image.getHeight());

                    if (image.getMetadata() != null
                            && image.getMetadata().getFile() != null
                            && image.getMetadata().getFile().getFile() != null) {
                        imageNode.put("Name", image.getMetadata().getFile().getFile());
                    }

                    if (image.getColorSpace() != null) {
                        imageNode.put("ColorSpace", image.getColorSpace().getName());
                    }

                    imageNode.put("BitsPerComponent", image.getBitsPerComponent());

                    imagesArray.add(imageNode);
                }
            }
        } catch (Exception e) {
            log.error("Error extracting page images: {}", e.getMessage());
        }

        return imagesArray;
    }

    private static ArrayNode extractPageLinks(PDPage page) throws IOException {
        ArrayNode linksArray = objectMapper.createArrayNode();
        Set<String> uniqueURIs = new HashSet<>();

        List<PDAnnotation> annotations = page.getAnnotations();
        for (PDAnnotation annotation : annotations) {
            if (annotation instanceof PDAnnotationLink linkAnnotation
                    && linkAnnotation.getAction() instanceof PDActionURI uriAction) {
                String uri = uriAction.getURI();
                uniqueURIs.add(uri);
            }
        }

        for (String uri : uniqueURIs) {
            ObjectNode linkNode = objectMapper.createObjectNode();
            linkNode.put("URI", uri);
            linksArray.add(linkNode);
        }

        return linksArray;
    }

    private static ArrayNode extractPageFonts(PDResources resources) {
        ArrayNode fontsArray = objectMapper.createArrayNode();
        Map<String, ObjectNode> uniqueFontsMap = new HashMap<>();

        try {
            for (COSName fontName : resources.getFontNames()) {
                PDFont font = resources.getFont(fontName);
                ObjectNode fontNode = objectMapper.createObjectNode();

                fontNode.put("IsEmbedded", font.isEmbedded());
                fontNode.put("Name", font.getName());
                fontNode.put("Subtype", font.getType());

                PDFontDescriptor fontDescriptor = font.getFontDescriptor();
                if (fontDescriptor != null) {
                    fontNode.put("ItalicAngle", fontDescriptor.getItalicAngle());
                    int flags = fontDescriptor.getFlags();
                    fontNode.put("IsItalic", (flags & 1) != 0);
                    fontNode.put("IsBold", (flags & 64) != 0);
                    fontNode.put("IsFixedPitch", (flags & 2) != 0);
                    fontNode.put("IsSerif", (flags & 4) != 0);
                    fontNode.put("IsSymbolic", (flags & 8) != 0);
                    fontNode.put("IsScript", (flags & 16) != 0);
                    fontNode.put("IsNonsymbolic", (flags & 32) != 0);
                    fontNode.put("FontFamily", fontDescriptor.getFontFamily());
                    fontNode.put("FontWeight", fontDescriptor.getFontWeight());
                }

                String uniqueKey = fontNode.toString();
                if (uniqueFontsMap.containsKey(uniqueKey)) {
                    ObjectNode existingFontNode = uniqueFontsMap.get(uniqueKey);
                    int count = existingFontNode.get("Count").asInt() + 1;
                    existingFontNode.put("Count", count);
                } else {
                    fontNode.put("Count", 1);
                    uniqueFontsMap.put(uniqueKey, fontNode);
                }
            }

            for (ObjectNode uniqueFontNode : uniqueFontsMap.values()) {
                fontsArray.add(uniqueFontNode);
            }
        } catch (Exception e) {
            log.error("Error extracting page fonts: {}", e.getMessage());
        }

        return fontsArray;
    }

    private static ObjectNode extractPageXObjects(PDResources resources) {
        ObjectNode xObjectCountNode = objectMapper.createObjectNode();
        Map<String, Integer> xObjectCountMap = new HashMap<>();

        try {
            for (COSName name : resources.getXObjectNames()) {
                PDXObject xObject = resources.getXObject(name);
                String xObjectType;

                if (xObject instanceof PDImageXObject) {
                    xObjectType = "Image";
                } else if (xObject instanceof PDFormXObject) {
                    xObjectType = "Form";
                } else {
                    xObjectType = "Other";
                }

                xObjectCountMap.put(xObjectType, xObjectCountMap.getOrDefault(xObjectType, 0) + 1);
            }

            for (Map.Entry<String, Integer> entry : xObjectCountMap.entrySet()) {
                xObjectCountNode.put(entry.getKey(), entry.getValue());
            }
        } catch (Exception e) {
            log.error("Error extracting page XObjects: {}", e.getMessage());
        }

        return xObjectCountNode;
    }

    private static ArrayNode extractPageMultimedia(PDPage page) throws IOException {
        ArrayNode multimediaArray = objectMapper.createArrayNode();

        List<PDAnnotation> annotations = page.getAnnotations();
        for (PDAnnotation annotation : annotations) {
            if ("RichMedia".equals(annotation.getSubtype())) {
                ObjectNode multimediaNode = objectMapper.createObjectNode();
                multimediaNode.put("Subtype", annotation.getSubtype());
                multimediaNode.put("Contents", annotation.getContents());
                multimediaArray.add(multimediaNode);
            }
        }

        return multimediaArray;
    }

    private static ImageStatistics calculateImageStatistics(PDDocument document) {
        ImageStatistics stats = new ImageStatistics();
        stats.totalImages = 0;
        stats.uniqueImages = 0;

        try {
            Set<String> uniqueImageHashes = new HashSet<>();

            for (PDPage page : document.getPages()) {
                PDResources resources = page.getResources();
                if (resources != null) {
                    for (COSName xObjectName : resources.getXObjectNames()) {
                        PDXObject xObject = resources.getXObject(xObjectName);
                        if (xObject instanceof PDImageXObject image) {
                            stats.totalImages++;

                            // Create a hash based on image properties
                            String imageHash =
                                    String.format(
                                            "%d_%d_%d_%s",
                                            image.getWidth(),
                                            image.getHeight(),
                                            image.getBitsPerComponent(),
                                            image.getSuffix());
                            uniqueImageHashes.add(imageHash);
                        }
                    }
                }
            }

            stats.uniqueImages = uniqueImageHashes.size();
        } catch (Exception e) {
            log.error("Error calculating image statistics: {}", e.getMessage());
        }

        return stats;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/get-info-on-pdf")
    @Operation(
            summary = "Get comprehensive PDF information",
            description =
                    "Extracts all available information from a PDF file. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<byte[]> getPdfInfo(@ModelAttribute PDFFile request) throws IOException {
        MultipartFile inputFile = request.getFileInput();

        // Validate input
        try {
            validatePdfFile(inputFile);
        } catch (IllegalArgumentException e) {
            log.error("Invalid PDF file: {}", e.getMessage());
            return createErrorResponse("Invalid PDF file: " + e.getMessage());
        }

        boolean readonly = true;

        try (PDDocument pdfBoxDoc = pdfDocumentFactory.load(inputFile, readonly)) {
            ObjectNode jsonOutput = objectMapper.createObjectNode();

            ObjectNode metadata = extractMetadata(pdfBoxDoc);
            ObjectNode basicInfo = extractBasicInfo(pdfBoxDoc, inputFile.getSize());
            ObjectNode docInfoNode = extractDocumentInfo(pdfBoxDoc);
            ObjectNode compliancy = extractComplianceInfo(pdfBoxDoc);
            ObjectNode encryption = extractEncryptionInfo(pdfBoxDoc);
            ObjectNode permissionsNode = extractPermissions(pdfBoxDoc);
            ObjectNode other = extractOtherInfo(pdfBoxDoc);
            ObjectNode formFieldsNode = extractFormFields(pdfBoxDoc);

            // Generate summary data
            String pdfaConformanceLevel = getPdfAConformanceLevel(pdfBoxDoc);
            Boolean pdfaValidationPassed = null;
            if (pdfaConformanceLevel != null) {
                pdfaValidationPassed = validatePdfAWithPreflight(pdfBoxDoc, pdfaConformanceLevel);
            }
            ObjectNode summaryData =
                    generatePDFSummaryData(pdfBoxDoc, pdfaConformanceLevel, pdfaValidationPassed);

            // Extract per-page information
            ObjectNode pageInfoParent = extractPerPageInfo(pdfBoxDoc);

            // Assemble final JSON output
            jsonOutput.set("Metadata", metadata);
            jsonOutput.set("BasicInfo", basicInfo);
            jsonOutput.set("DocumentInfo", docInfoNode);
            jsonOutput.set("Compliancy", compliancy);
            jsonOutput.set("Encryption", encryption);
            jsonOutput.set("Permissions", permissionsNode);
            jsonOutput.set("FormFields", formFieldsNode);
            jsonOutput.set("Other", other);
            jsonOutput.set("PerPageInfo", pageInfoParent);

            if (summaryData != null && !summaryData.isEmpty()) {
                jsonOutput.set("SummaryData", summaryData);
            }

            // Convert to JSON string
            String jsonString =
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(jsonOutput);

            return WebResponseUtils.bytesToWebResponse(
                    jsonString.getBytes(StandardCharsets.UTF_8),
                    "response.json",
                    MediaType.APPLICATION_JSON);

        } catch (IOException e) {
            log.error("IO error while processing PDF: {}", e.getMessage(), e);
            return createErrorResponse("Error reading PDF file: " + e.getMessage());
        } catch (Exception e) {
            log.error("Unexpected error while processing PDF: {}", e.getMessage(), e);
            return createErrorResponse("Unexpected error processing PDF: " + e.getMessage());
        }
    }

    private ObjectNode extractBasicInfo(PDDocument document, long fileSizeInBytes) {
        ObjectNode basicInfo = objectMapper.createObjectNode();

        try {
            basicInfo.put("FileSizeInBytes", fileSizeInBytes);

            String fullText = new PDFTextStripper().getText(document);
            String[] words = RegexPatternUtils.getInstance().getWhitespacePattern().split(fullText);
            int paragraphCount =
                    RegexPatternUtils.getInstance()
                            .getMultiFormatNewlinePattern()
                            .split(fullText)
                            .length;

            basicInfo.put("WordCount", words.length);
            basicInfo.put("ParagraphCount", paragraphCount);
            basicInfo.put("CharacterCount", fullText.length());

            String language = document.getDocumentCatalog().getLanguage();
            if (language != null) {
                basicInfo.put("Language", language);
            }
            basicInfo.put("Number of pages", document.getNumberOfPages());

            ImageStatistics imageStats = calculateImageStatistics(document);
            basicInfo.put("TotalImages", imageStats.totalImages);
            basicInfo.put("UniqueImages", imageStats.uniqueImages);

        } catch (Exception e) {
            log.error("Error extracting basic info: {}", e.getMessage());
        }

        return basicInfo;
    }

    private static class ImageStatistics {
        int totalImages;
        int uniqueImages;
    }

    private static String getPageModeDescription(String pageMode) {
        if (pageMode == null) return "Unknown";
        return RegexPatternUtils.getInstance()
                .getPageModePattern()
                .matcher(pageMode)
                .replaceFirst("");
    }
}
