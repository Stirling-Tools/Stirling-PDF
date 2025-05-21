package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.*;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.encryption.PDEncryption;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;

@RestController
@RequestMapping("/api/v1/analysis")
@Tag(name = "Analysis", description = "Analysis APIs")
@RequiredArgsConstructor
public class AnalysisController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/page-count", consumes = "multipart/form-data")
    @Operation(
            summary = "Get PDF page count",
            description = "Returns total number of pages in PDF. Input:PDF Output:JSON Type:SISO")
    public Map<String, Integer> getPageCount(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            return Map.of("pageCount", document.getNumberOfPages());
        }
    }

    @PostMapping(value = "/basic-info", consumes = "multipart/form-data")
    @Operation(
            summary = "Get basic PDF information",
            description = "Returns page count, version, file size. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getBasicInfo(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            Map<String, Object> info = new HashMap<>();
            info.put("pageCount", document.getNumberOfPages());
            info.put("pdfVersion", document.getVersion());
            info.put("fileSize", file.getFileInput().getSize());
            return info;
        }
    }

    @PostMapping(value = "/document-properties", consumes = "multipart/form-data")
    @Operation(
            summary = "Get PDF document properties",
            description = "Returns title, author, subject, etc. Input:PDF Output:JSON Type:SISO")
    public Map<String, String> getDocumentProperties(@ModelAttribute PDFFile file)
            throws IOException {
        // Load the document in read-only mode to prevent modifications and ensure the integrity of
        // the original file.
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput(), true)) {
            PDDocumentInformation info = document.getDocumentInformation();
            Map<String, String> properties = new HashMap<>();
            properties.put("title", info.getTitle());
            properties.put("author", info.getAuthor());
            properties.put("subject", info.getSubject());
            properties.put("keywords", info.getKeywords());
            properties.put("creator", info.getCreator());
            properties.put("producer", info.getProducer());
            properties.put("creationDate", info.getCreationDate().toString());
            properties.put("modificationDate", info.getModificationDate().toString());
            return properties;
        }
    }

    @PostMapping(value = "/page-dimensions", consumes = "multipart/form-data")
    @Operation(
            summary = "Get page dimensions for all pages",
            description = "Returns width and height of each page. Input:PDF Output:JSON Type:SISO")
    public List<Map<String, Float>> getPageDimensions(@ModelAttribute PDFFile file)
            throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            List<Map<String, Float>> dimensions = new ArrayList<>();
            PDPageTree pages = document.getPages();

            for (PDPage page : pages) {
                Map<String, Float> pageDim = new HashMap<>();
                pageDim.put("width", page.getBBox().getWidth());
                pageDim.put("height", page.getBBox().getHeight());
                dimensions.add(pageDim);
            }
            return dimensions;
        }
    }

    @PostMapping(value = "/form-fields", consumes = "multipart/form-data")
    @Operation(
            summary = "Get form field information",
            description =
                    "Returns count and details of form fields. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getFormFields(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            Map<String, Object> formInfo = new HashMap<>();
            PDAcroForm form = document.getDocumentCatalog().getAcroForm();

            if (form != null) {
                formInfo.put("fieldCount", form.getFields().size());
                formInfo.put("hasXFA", form.hasXFA());
                formInfo.put("isSignaturesExist", form.isSignaturesExist());
            } else {
                formInfo.put("fieldCount", 0);
                formInfo.put("hasXFA", false);
                formInfo.put("isSignaturesExist", false);
            }
            return formInfo;
        }
    }

    @PostMapping(value = "/annotation-info", consumes = "multipart/form-data")
    @Operation(
            summary = "Get annotation information",
            description = "Returns count and types of annotations. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getAnnotationInfo(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            Map<String, Object> annotInfo = new HashMap<>();
            int totalAnnotations = 0;
            Map<String, Integer> annotationTypes = new HashMap<>();

            for (PDPage page : document.getPages()) {
                for (PDAnnotation annot : page.getAnnotations()) {
                    totalAnnotations++;
                    String subType = annot.getSubtype();
                    annotationTypes.merge(subType, 1, Integer::sum);
                }
            }

            annotInfo.put("totalCount", totalAnnotations);
            annotInfo.put("typeBreakdown", annotationTypes);
            return annotInfo;
        }
    }

    @PostMapping(value = "/font-info", consumes = "multipart/form-data")
    @Operation(
            summary = "Get font information",
            description =
                    "Returns list of fonts used in the document. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getFontInfo(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            Map<String, Object> fontInfo = new HashMap<>();
            Set<String> fontNames = new HashSet<>();

            for (PDPage page : document.getPages()) {
                for (COSName font : page.getResources().getFontNames()) {
                    fontNames.add(font.getName());
                }
            }

            fontInfo.put("fontCount", fontNames.size());
            fontInfo.put("fonts", fontNames);
            return fontInfo;
        }
    }

    @PostMapping(value = "/security-info", consumes = "multipart/form-data")
    @Operation(
            summary = "Get security information",
            description =
                    "Returns encryption and permission details. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getSecurityInfo(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            Map<String, Object> securityInfo = new HashMap<>();
            PDEncryption encryption = document.getEncryption();

            if (encryption != null) {
                securityInfo.put("isEncrypted", true);
                securityInfo.put("keyLength", encryption.getLength());

                // Get permissions
                Map<String, Boolean> permissions = new HashMap<>();
                permissions.put(
                        "preventPrinting", !document.getCurrentAccessPermission().canPrint());
                permissions.put(
                        "preventModify", !document.getCurrentAccessPermission().canModify());
                permissions.put(
                        "preventExtractContent",
                        !document.getCurrentAccessPermission().canExtractContent());
                permissions.put(
                        "preventModifyAnnotations",
                        !document.getCurrentAccessPermission().canModifyAnnotations());

                securityInfo.put("permissions", permissions);
            } else {
                securityInfo.put("isEncrypted", false);
            }

            return securityInfo;
        }
    }
}
