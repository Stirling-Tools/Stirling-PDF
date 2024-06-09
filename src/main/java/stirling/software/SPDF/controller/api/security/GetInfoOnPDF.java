package stirling.software.SPDF.controller.api.security;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSInputStream;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDJavascriptNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
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
import org.apache.pdfbox.pdmodel.graphics.color.PDColorSpace;
import org.apache.pdfbox.pdmodel.graphics.color.PDICCBased;
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
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpParsingException;
import org.apache.xmpbox.xml.XmpSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/security")
@Tag(name = "Security", description = "Security APIs")
public class GetInfoOnPDF {

    private static final Logger logger = LoggerFactory.getLogger(GetInfoOnPDF.class);

    static ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping(consumes = "multipart/form-data", value = "/get-info-on-pdf")
    @Operation(summary = "Summary here", description = "desc. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<byte[]> getPdfInfo(@ModelAttribute PDFFile request) throws IOException {
        MultipartFile inputFile = request.getFileInput();
        try (PDDocument pdfBoxDoc = Loader.loadPDF(inputFile.getBytes()); ) {
            ObjectMapper objectMapper = new ObjectMapper();
            ObjectNode jsonOutput = objectMapper.createObjectNode();

            // Metadata using PDFBox
            PDDocumentInformation info = pdfBoxDoc.getDocumentInformation();
            ObjectNode metadata = objectMapper.createObjectNode();
            ObjectNode basicInfo = objectMapper.createObjectNode();
            ObjectNode docInfoNode = objectMapper.createObjectNode();
            ObjectNode compliancy = objectMapper.createObjectNode();
            ObjectNode encryption = objectMapper.createObjectNode();
            ObjectNode other = objectMapper.createObjectNode();

            metadata.put("Title", info.getTitle());
            metadata.put("Author", info.getAuthor());
            metadata.put("Subject", info.getSubject());
            metadata.put("Keywords", info.getKeywords());
            metadata.put("Producer", info.getProducer());
            metadata.put("Creator", info.getCreator());
            metadata.put("CreationDate", formatDate(info.getCreationDate()));
            metadata.put("ModificationDate", formatDate(info.getModificationDate()));
            jsonOutput.set("Metadata", metadata);

            // Total file size of the PDF
            long fileSizeInBytes = inputFile.getSize();
            basicInfo.put("FileSizeInBytes", fileSizeInBytes);

            // Number of words, paragraphs, and images in the entire document
            String fullText = new PDFTextStripper().getText(pdfBoxDoc);
            String[] words = fullText.split("\\s+");
            int wordCount = words.length;
            int paragraphCount = fullText.split("\r\n|\r|\n").length;
            basicInfo.put("WordCount", wordCount);
            basicInfo.put("ParagraphCount", paragraphCount);
            // Number of characters in the entire document (including spaces and special characters)
            int charCount = fullText.length();
            basicInfo.put("CharacterCount", charCount);

            // Initialize the flags and types
            boolean hasCompression = false;
            String compressionType = "None";

            basicInfo.put("Compression", hasCompression);
            if (hasCompression) basicInfo.put("CompressionType", compressionType);

            String language = pdfBoxDoc.getDocumentCatalog().getLanguage();
            basicInfo.put("Language", language);
            basicInfo.put("Number of pages", pdfBoxDoc.getNumberOfPages());

            PDDocumentCatalog catalog = pdfBoxDoc.getDocumentCatalog();
            String pageMode = catalog.getPageMode().name();

            // Document Information using PDFBox
            docInfoNode.put("PDF version", pdfBoxDoc.getVersion());
            docInfoNode.put("Trapped", info.getTrapped());
            docInfoNode.put("Page Mode", getPageModeDescription(pageMode));
            ;

            PDAcroForm acroForm = pdfBoxDoc.getDocumentCatalog().getAcroForm();

            ObjectNode formFieldsNode = objectMapper.createObjectNode();
            if (acroForm != null) {
                for (PDField field : acroForm.getFieldTree()) {
                    formFieldsNode.put(field.getFullyQualifiedName(), field.getValueAsString());
                }
            }
            jsonOutput.set("FormFields", formFieldsNode);

            // embeed files TODO size
            if (catalog.getNames() != null) {
                PDEmbeddedFilesNameTreeNode efTree = catalog.getNames().getEmbeddedFiles();

                ArrayNode embeddedFilesArray = objectMapper.createArrayNode();
                if (efTree != null) {
                    Map<String, PDComplexFileSpecification> efMap = efTree.getNames();
                    if (efMap != null) {
                        for (Map.Entry<String, PDComplexFileSpecification> entry :
                                efMap.entrySet()) {
                            ObjectNode embeddedFileNode = objectMapper.createObjectNode();
                            embeddedFileNode.put("Name", entry.getKey());
                            PDEmbeddedFile embeddedFile = entry.getValue().getEmbeddedFile();
                            if (embeddedFile != null) {
                                embeddedFileNode.put(
                                        "FileSize", embeddedFile.getLength()); // size in bytes
                            }
                            embeddedFilesArray.add(embeddedFileNode);
                        }
                    }
                }
                other.set("EmbeddedFiles", embeddedFilesArray);
            }

            // attachments TODO size
            ArrayNode attachmentsArray = objectMapper.createArrayNode();
            for (PDPage page : pdfBoxDoc.getPages()) {
                for (PDAnnotation annotation : page.getAnnotations()) {
                    if (annotation instanceof PDAnnotationFileAttachment) {
                        PDAnnotationFileAttachment fileAttachmentAnnotation =
                                (PDAnnotationFileAttachment) annotation;

                        ObjectNode attachmentNode = objectMapper.createObjectNode();
                        attachmentNode.put("Name", fileAttachmentAnnotation.getAttachmentName());
                        attachmentNode.put("Description", fileAttachmentAnnotation.getContents());

                        attachmentsArray.add(attachmentNode);
                    }
                }
            }
            other.set("Attachments", attachmentsArray);

            // Javascript
            PDDocumentNameDictionary namesDict = catalog.getNames();
            ArrayNode javascriptArray = objectMapper.createArrayNode();

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
                        logger.error("exception", e);
                    }
                }
            }
            other.set("JavaScript", javascriptArray);

            // TODO size
            PDOptionalContentProperties ocProperties =
                    pdfBoxDoc.getDocumentCatalog().getOCProperties();
            ArrayNode layersArray = objectMapper.createArrayNode();

            if (ocProperties != null) {
                for (PDOptionalContentGroup ocg : ocProperties.getOptionalContentGroups()) {
                    ObjectNode layerNode = objectMapper.createObjectNode();
                    layerNode.put("Name", ocg.getName());
                    layersArray.add(layerNode);
                }
            }

            other.set("Layers", layersArray);

            // TODO Security

            PDStructureTreeRoot structureTreeRoot =
                    pdfBoxDoc.getDocumentCatalog().getStructureTreeRoot();
            ArrayNode structureTreeArray;
            try {
                if (structureTreeRoot != null) {
                    structureTreeArray = exploreStructureTree(structureTreeRoot.getKids());
                    other.set("StructureTree", structureTreeArray);
                }
            } catch (Exception e) {
                // TODO Auto-generated catch block
                logger.error("exception", e);
            }

            boolean isPdfACompliant = checkForStandard(pdfBoxDoc, "PDF/A");
            boolean isPdfXCompliant = checkForStandard(pdfBoxDoc, "PDF/X");
            boolean isPdfECompliant = checkForStandard(pdfBoxDoc, "PDF/E");
            boolean isPdfVTCompliant = checkForStandard(pdfBoxDoc, "PDF/VT");
            boolean isPdfUACompliant = checkForStandard(pdfBoxDoc, "PDF/UA");
            boolean isPdfBCompliant =
                    checkForStandard(
                            pdfBoxDoc,
                            "PDF/B"); // If you want to check for PDF/Broadcast, though this isn't
            // an official ISO standard.
            boolean isPdfSECCompliant =
                    checkForStandard(
                            pdfBoxDoc,
                            "PDF/SEC"); // This might not be effective since PDF/SEC was under
            // development in 2021.

            compliancy.put("IsPDF/ACompliant", isPdfACompliant);
            compliancy.put("IsPDF/XCompliant", isPdfXCompliant);
            compliancy.put("IsPDF/ECompliant", isPdfECompliant);
            compliancy.put("IsPDF/VTCompliant", isPdfVTCompliant);
            compliancy.put("IsPDF/UACompliant", isPdfUACompliant);
            compliancy.put("IsPDF/BCompliant", isPdfBCompliant);
            compliancy.put("IsPDF/SECCompliant", isPdfSECCompliant);

            PDOutlineNode root = pdfBoxDoc.getDocumentCatalog().getDocumentOutline();
            ArrayNode bookmarksArray = objectMapper.createArrayNode();

            if (root != null) {
                for (PDOutlineItem child : root.children()) {
                    addOutlinesToArray(child, bookmarksArray);
                }
            }

            other.set("Bookmarks/Outline/TOC", bookmarksArray);

            PDMetadata pdMetadata = pdfBoxDoc.getDocumentCatalog().getMetadata();

            String xmpString = null;

            if (pdMetadata != null) {
                try {
                    COSInputStream is = pdMetadata.createInputStream();
                    DomXmpParser domXmpParser = new DomXmpParser();
                    XMPMetadata xmpMeta = domXmpParser.parse(is);

                    ByteArrayOutputStream os = new ByteArrayOutputStream();
                    new XmpSerializer().serialize(xmpMeta, os, true);
                    xmpString = new String(os.toByteArray(), StandardCharsets.UTF_8);
                } catch (XmpParsingException | IOException e) {
                    logger.error("exception", e);
                }
            }

            other.put("XMPMetadata", xmpString);

            if (pdfBoxDoc.isEncrypted()) {
                encryption.put("IsEncrypted", true);

                // Retrieve encryption details using getEncryption()
                PDEncryption pdfEncryption = pdfBoxDoc.getEncryption();
                encryption.put("EncryptionAlgorithm", pdfEncryption.getFilter());
                encryption.put("KeyLength", pdfEncryption.getLength());
                AccessPermission ap = pdfBoxDoc.getCurrentAccessPermission();
                if (ap != null) {
                    ObjectNode permissionsNode = objectMapper.createObjectNode();

                    permissionsNode.put("CanAssembleDocument", ap.canAssembleDocument());
                    permissionsNode.put("CanExtractContent", ap.canExtractContent());
                    permissionsNode.put(
                            "CanExtractForAccessibility", ap.canExtractForAccessibility());
                    permissionsNode.put("CanFillInForm", ap.canFillInForm());
                    permissionsNode.put("CanModify", ap.canModify());
                    permissionsNode.put("CanModifyAnnotations", ap.canModifyAnnotations());
                    permissionsNode.put("CanPrint", ap.canPrint());

                    encryption.set(
                            "Permissions", permissionsNode); // set the node under "Permissions"
                }
                // Add other encryption-related properties as needed
            } else {
                encryption.put("IsEncrypted", false);
            }

            ObjectNode pageInfoParent = objectMapper.createObjectNode();
            for (int pageNum = 0; pageNum < pdfBoxDoc.getNumberOfPages(); pageNum++) {
                ObjectNode pageInfo = objectMapper.createObjectNode();

                // Retrieve the page
                PDPage page = pdfBoxDoc.getPage(pageNum);

                // Page-level Information
                PDRectangle mediaBox = page.getMediaBox();

                float width = mediaBox.getWidth();
                float height = mediaBox.getHeight();

                ObjectNode sizeInfo = objectMapper.createObjectNode();

                getDimensionInfo(sizeInfo, width, height);

                sizeInfo.put("Standard Page", getPageSize(width, height));
                pageInfo.set("Size", sizeInfo);

                pageInfo.put("Rotation", page.getRotation());
                pageInfo.put("Page Orientation", getPageOrientation(width, height));

                // Boxes
                pageInfo.put("MediaBox", mediaBox.toString());

                // Assuming the following boxes are defined for your document; if not, you may get
                // null values.
                PDRectangle cropBox = page.getCropBox();
                pageInfo.put("CropBox", cropBox == null ? "Undefined" : cropBox.toString());

                PDRectangle bleedBox = page.getBleedBox();
                pageInfo.put("BleedBox", bleedBox == null ? "Undefined" : bleedBox.toString());

                PDRectangle trimBox = page.getTrimBox();
                pageInfo.put("TrimBox", trimBox == null ? "Undefined" : trimBox.toString());

                PDRectangle artBox = page.getArtBox();
                pageInfo.put("ArtBox", artBox == null ? "Undefined" : artBox.toString());

                // Content Extraction
                PDFTextStripper textStripper = new PDFTextStripper();
                textStripper.setStartPage(pageNum + 1);
                textStripper.setEndPage(pageNum + 1);
                String pageText = textStripper.getText(pdfBoxDoc);

                pageInfo.put("Text Characters Count", pageText.length()); //

                // Annotations

                List<PDAnnotation> annotations = page.getAnnotations();

                int subtypeCount = 0;
                int contentsCount = 0;

                for (PDAnnotation annotation : annotations) {
                    if (annotation.getSubtype() != null) {
                        subtypeCount++; // Increase subtype count
                    }
                    if (annotation.getContents() != null) {
                        contentsCount++; // Increase contents count
                    }
                }

                ObjectNode annotationsObject = objectMapper.createObjectNode();
                annotationsObject.put("AnnotationsCount", annotations.size());
                annotationsObject.put("SubtypeCount", subtypeCount);
                annotationsObject.put("ContentsCount", contentsCount);
                pageInfo.set("Annotations", annotationsObject);

                // Images (simplified)
                // This part is non-trivial as images can be embedded in multiple ways in a PDF.
                // Here is a basic structure to recognize image XObjects on a page.
                ArrayNode imagesArray = objectMapper.createArrayNode();
                PDResources resources = page.getResources();

                for (COSName name : resources.getXObjectNames()) {
                    PDXObject xObject = resources.getXObject(name);
                    if (xObject instanceof PDImageXObject) {
                        PDImageXObject image = (PDImageXObject) xObject;

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

                        imagesArray.add(imageNode);
                    }
                }
                pageInfo.set("Images", imagesArray);

                // Links
                ArrayNode linksArray = objectMapper.createArrayNode();
                Set<String> uniqueURIs = new HashSet<>(); // To store unique URIs

                for (PDAnnotation annotation : annotations) {
                    if (annotation instanceof PDAnnotationLink) {
                        PDAnnotationLink linkAnnotation = (PDAnnotationLink) annotation;
                        if (linkAnnotation.getAction() instanceof PDActionURI) {
                            PDActionURI uriAction = (PDActionURI) linkAnnotation.getAction();
                            String uri = uriAction.getURI();
                            uniqueURIs.add(uri); // Add to set to ensure uniqueness
                        }
                    }
                }

                // Add unique URIs to linksArray
                for (String uri : uniqueURIs) {
                    ObjectNode linkNode = objectMapper.createObjectNode();
                    linkNode.put("URI", uri);
                    linksArray.add(linkNode);
                }
                pageInfo.set("Links", linksArray);

                // Fonts
                ArrayNode fontsArray = objectMapper.createArrayNode();
                Map<String, ObjectNode> uniqueFontsMap = new HashMap<>();

                for (COSName fontName : resources.getFontNames()) {
                    PDFont font = resources.getFont(fontName);
                    ObjectNode fontNode = objectMapper.createObjectNode();

                    fontNode.put("IsEmbedded", font.isEmbedded());

                    // PDFBox provides Font's BaseFont (i.e., the font name) directly
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
                        // Font stretch and BBox are not directly available in PDFBox's API, so
                        // these are omitted for simplicity
                        fontNode.put("FontWeight", fontDescriptor.getFontWeight());
                    }

                    // Create a unique key for this font node based on its attributes
                    String uniqueKey = fontNode.toString();

                    // Increment count if this font exists, or initialize it if new
                    if (uniqueFontsMap.containsKey(uniqueKey)) {
                        ObjectNode existingFontNode = uniqueFontsMap.get(uniqueKey);
                        int count = existingFontNode.get("Count").asInt() + 1;
                        existingFontNode.put("Count", count);
                    } else {
                        fontNode.put("Count", 1);
                        uniqueFontsMap.put(uniqueKey, fontNode);
                    }
                }

                // Add unique font entries to fontsArray
                for (ObjectNode uniqueFontNode : uniqueFontsMap.values()) {
                    fontsArray.add(uniqueFontNode);
                }

                pageInfo.set("Fonts", fontsArray);

                // Access resources dictionary
                ArrayNode colorSpacesArray = objectMapper.createArrayNode();

                Iterable<COSName> colorSpaceNames = resources.getColorSpaceNames();
                for (COSName name : colorSpaceNames) {
                    PDColorSpace colorSpace = resources.getColorSpace(name);
                    if (colorSpace instanceof PDICCBased) {
                        PDICCBased iccBased = (PDICCBased) colorSpace;
                        PDStream iccData = iccBased.getPDStream();
                        byte[] iccBytes = iccData.toByteArray();

                        // TODO: Further decode and analyze the ICC data if needed
                        ObjectNode iccProfileNode = objectMapper.createObjectNode();
                        iccProfileNode.put("ICC Profile Length", iccBytes.length);
                        colorSpacesArray.add(iccProfileNode);
                    }
                }
                pageInfo.set("Color Spaces & ICC Profiles", colorSpacesArray);

                // Other XObjects
                Map<String, Integer> xObjectCountMap =
                        new HashMap<>(); // To store the count for each type
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

                    // Increment the count for this type in the map
                    xObjectCountMap.put(
                            xObjectType, xObjectCountMap.getOrDefault(xObjectType, 0) + 1);
                }

                // Add the count map to pageInfo (or wherever you want to store it)
                ObjectNode xObjectCountNode = objectMapper.createObjectNode();
                for (Map.Entry<String, Integer> entry : xObjectCountMap.entrySet()) {
                    xObjectCountNode.put(entry.getKey(), entry.getValue());
                }
                pageInfo.set("XObjectCounts", xObjectCountNode);

                ArrayNode multimediaArray = objectMapper.createArrayNode();

                for (PDAnnotation annotation : annotations) {
                    if ("RichMedia".equals(annotation.getSubtype())) {
                        ObjectNode multimediaNode = objectMapper.createObjectNode();
                        // Extract details from the annotation as needed
                        multimediaArray.add(multimediaNode);
                    }
                }

                pageInfo.set("Multimedia", multimediaArray);

                pageInfoParent.set("Page " + (pageNum + 1), pageInfo);
            }

            jsonOutput.set("BasicInfo", basicInfo);
            jsonOutput.set("DocumentInfo", docInfoNode);
            jsonOutput.set("Compliancy", compliancy);
            jsonOutput.set("Encryption", encryption);
            jsonOutput.set("Other", other);
            jsonOutput.set("PerPageInfo", pageInfoParent);

            // Save JSON to file
            String jsonString =
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(jsonOutput);

            return WebResponseUtils.bytesToWebResponse(
                    jsonString.getBytes(StandardCharsets.UTF_8),
                    "response.json",
                    MediaType.APPLICATION_JSON);

        } catch (Exception e) {
            logger.error("exception", e);
        }
        return null;
    }

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

    public String getPageOrientation(double width, double height) {
        if (width > height) {
            return "Landscape";
        } else if (height > width) {
            return "Portrait";
        } else {
            return "Square";
        }
    }

    public String getPageSize(float width, float height) {
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

    private boolean isCloseToSize(
            float width, float height, float standardWidth, float standardHeight) {
        float tolerance = 1.0f; // You can adjust the tolerance as needed
        return Math.abs(width - standardWidth) <= tolerance
                && Math.abs(height - standardHeight) <= tolerance;
    }

    public ObjectNode getDimensionInfo(ObjectNode dimensionInfo, float width, float height) {
        float ppi = 72; // Points Per Inch

        float widthInInches = width / ppi;
        float heightInInches = height / ppi;

        float widthInCm = widthInInches * 2.54f;
        float heightInCm = heightInInches * 2.54f;

        dimensionInfo.put("Width (px)", String.format("%.2f", width));
        dimensionInfo.put("Height (px)", String.format("%.2f", height));
        dimensionInfo.put("Width (in)", String.format("%.2f", widthInInches));
        dimensionInfo.put("Height (in)", String.format("%.2f", heightInInches));
        dimensionInfo.put("Width (cm)", String.format("%.2f", widthInCm));
        dimensionInfo.put("Height (cm)", String.format("%.2f", heightInCm));
        return dimensionInfo;
    }

    public static boolean checkForStandard(PDDocument document, String standardKeyword) {
        // Check XMP Metadata
        try {
            PDMetadata pdMetadata = document.getDocumentCatalog().getMetadata();
            if (pdMetadata != null) {
                COSInputStream metaStream = pdMetadata.createInputStream();
                DomXmpParser domXmpParser = new DomXmpParser();
                XMPMetadata xmpMeta = domXmpParser.parse(metaStream);

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                new XmpSerializer().serialize(xmpMeta, baos, true);
                String xmpString = new String(baos.toByteArray(), StandardCharsets.UTF_8);

                if (xmpString.contains(standardKeyword)) {
                    return true;
                }
            }
        } catch (
                Exception
                        e) { // Catching general exception for brevity, ideally you'd catch specific
            // exceptions.
            logger.error("exception", e);
        }

        return false;
    }

    public ArrayNode exploreStructureTree(List<Object> nodes) {
        ArrayNode elementsArray = objectMapper.createArrayNode();
        if (nodes != null) {
            for (Object obj : nodes) {
                if (obj instanceof PDStructureNode) {
                    PDStructureNode node = (PDStructureNode) obj;
                    ObjectNode elementNode = objectMapper.createObjectNode();

                    if (node instanceof PDStructureElement) {
                        PDStructureElement structureElement = (PDStructureElement) node;
                        elementNode.put("Type", structureElement.getStructureType());
                        elementNode.put("Content", getContent(structureElement));

                        // Recursively explore child elements
                        ArrayNode childElements = exploreStructureTree(structureElement.getKids());
                        if (childElements.size() > 0) {
                            elementNode.set("Children", childElements);
                        }
                    }
                    elementsArray.add(elementNode);
                }
            }
        }
        return elementsArray;
    }

    public String getContent(PDStructureElement structureElement) {
        StringBuilder contentBuilder = new StringBuilder();

        for (Object item : structureElement.getKids()) {
            if (item instanceof COSString) {
                COSString cosString = (COSString) item;
                contentBuilder.append(cosString.getString());
            } else if (item instanceof PDStructureElement) {
                // For simplicity, we're handling only COSString and PDStructureElement here
                // but a more comprehensive method would handle other types too
                contentBuilder.append(getContent((PDStructureElement) item));
            }
        }

        return contentBuilder.toString();
    }

    private String formatDate(Calendar calendar) {
        if (calendar != null) {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            return sdf.format(calendar.getTime());
        } else {
            return null;
        }
    }

    private String getPageModeDescription(String pageMode) {
        return pageMode != null ? pageMode.toString().replaceFirst("/", "") : "Unknown";
    }
}
