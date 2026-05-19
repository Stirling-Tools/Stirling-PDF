package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.*;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.encryption.PDEncryption;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.JsonDataResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.AnalysisApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;

@AnalysisApi
@RequiredArgsConstructor
public class AnalysisController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @AutoJobPostMapping(value = "/page-count", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get PDF page count",
            description = "Returns total number of pages in PDF. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> getPageCount(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            return ResponseEntity.ok(Map.of("pageCount", document.getNumberOfPages()));
        }
    }

    @AutoJobPostMapping(value = "/basic-info", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get basic PDF information",
            description = "Returns page count, version, file size. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> getBasicInfo(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            Map<String, Object> info = new HashMap<>();
            info.put("pageCount", document.getNumberOfPages());
            info.put("pdfVersion", document.getVersion());
            info.put("fileSize", file.getFileInput().getSize());
            return ResponseEntity.ok(info);
        }
    }

    @AutoJobPostMapping(
            value = "/document-properties",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get PDF document properties",
            description = "Returns title, author, subject, etc. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> getDocumentProperties(@ModelAttribute PDFFile file)
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
            properties.put(
                    "creationDate",
                    info.getCreationDate() != null ? info.getCreationDate().toString() : null);
            properties.put(
                    "modificationDate",
                    info.getModificationDate() != null
                            ? info.getModificationDate().toString()
                            : null);
            return ResponseEntity.ok(properties);
        }
    }

    @AutoJobPostMapping(value = "/page-dimensions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get page dimensions for all pages",
            description = "Returns width and height of each page. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> getPageDimensions(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            List<Map<String, Float>> dimensions = new ArrayList<>();
            PDPageTree pages = document.getPages();

            for (PDPage page : pages) {
                Map<String, Float> pageDim = new HashMap<>();
                pageDim.put("width", page.getBBox().getWidth());
                pageDim.put("height", page.getBBox().getHeight());
                dimensions.add(pageDim);
            }
            return ResponseEntity.ok(dimensions);
        }
    }

    @AutoJobPostMapping(value = "/form-fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get form field information",
            description =
                    "Returns count and details of form fields. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> getFormFields(@ModelAttribute PDFFile file) throws IOException {
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
            return ResponseEntity.ok(formInfo);
        }
    }

    @AutoJobPostMapping(value = "/annotation-info", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get annotation information",
            description = "Returns count and types of annotations. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> getAnnotationInfo(@ModelAttribute PDFFile file) throws IOException {
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
            return ResponseEntity.ok(annotInfo);
        }
    }

    @AutoJobPostMapping(value = "/font-info", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get font information",
            description =
                    "Returns list of fonts used in the document. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> getFontInfo(@ModelAttribute PDFFile file) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            Map<String, Object> fontInfo = new HashMap<>();
            Set<String> fontNames = new HashSet<>();

            for (PDPage page : document.getPages()) {
                PDResources resources = page.getResources();
                if (resources != null) {
                    for (COSName font : resources.getFontNames()) {
                        fontNames.add(font.getName());
                    }
                }
            }

            fontInfo.put("fontCount", fontNames.size());
            fontInfo.put("fonts", fontNames);
            return ResponseEntity.ok(fontInfo);
        }
    }

    @AutoJobPostMapping(value = "/security-info", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get security information",
            description =
                    "Returns encryption and permission details. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<?> getSecurityInfo(@ModelAttribute PDFFile file) throws IOException {
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

            return ResponseEntity.ok(securityInfo);
        }
    }
}
