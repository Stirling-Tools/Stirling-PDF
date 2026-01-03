package stirling.software.SPDF.controller.api;

import java.beans.PropertyEditorSupport;
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
import org.springframework.http.MediaType;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.JsonDataResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.AnalysisApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.util.ExceptionUtils;

@AnalysisApi
@RequiredArgsConstructor
public class AnalysisController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final FileStorage fileStorage;

    /**
     * Initialize data binder for multipart file uploads. This method registers a custom editor for
     * MultipartFile to handle file uploads. It sets the MultipartFile to null if the uploaded file
     * is empty. This is necessary to avoid binding errors when the file is not present.
     */
    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                MultipartFile.class,
                new PropertyEditorSupport() {
                    @Override
                    public void setAsText(String text) throws IllegalArgumentException {
                        setValue(null);
                    }
                });
    }

    @AutoJobPostMapping(value = "/page-count", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get PDF page count",
            description = "Returns total number of pages in PDF. Input:PDF Output:JSON Type:SISO")
    public Map<String, Integer> getPageCount(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        MultipartFile inputFile;
        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
            return Map.of("pageCount", document.getNumberOfPages());
        }
    }

    @AutoJobPostMapping(value = "/basic-info", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get basic PDF information",
            description = "Returns page count, version, file size. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getBasicInfo(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        MultipartFile inputFile;
        long fileSizeInBytes;

        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        fileSizeInBytes = request.resolveFileSize(fileStorage);
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
            Map<String, Object> info = new HashMap<>();
            info.put("pageCount", document.getNumberOfPages());
            info.put("pdfVersion", document.getVersion());
            info.put("fileSize", fileSizeInBytes);
            return info;
        }
    }

    @AutoJobPostMapping(
            value = "/document-properties",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get PDF document properties",
            description = "Returns title, author, subject, etc. Input:PDF Output:JSON Type:SISO")
    public Map<String, String> getDocumentProperties(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        MultipartFile inputFile;

        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        // Load the document in read-only mode to prevent modifications and ensure the integrity of
        // the original file.
        try (PDDocument document = pdfDocumentFactory.load(inputFile, true)) {
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

    @AutoJobPostMapping(value = "/page-dimensions", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get page dimensions for all pages",
            description = "Returns width and height of each page. Input:PDF Output:JSON Type:SISO")
    public List<Map<String, Float>> getPageDimensions(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        MultipartFile inputFile;

        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
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

    @AutoJobPostMapping(value = "/form-fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get form field information",
            description =
                    "Returns count and details of form fields. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getFormFields(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        MultipartFile inputFile;

        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
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

    @AutoJobPostMapping(value = "/annotation-info", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get annotation information",
            description = "Returns count and types of annotations. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getAnnotationInfo(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        MultipartFile inputFile;

        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
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

    @AutoJobPostMapping(value = "/font-info", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get font information",
            description =
                    "Returns list of fonts used in the document. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getFontInfo(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        MultipartFile inputFile;

        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
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

    @AutoJobPostMapping(value = "/security-info", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @JsonDataResponse
    @Operation(
            summary = "Get security information",
            description =
                    "Returns encryption and permission details. Input:PDF Output:JSON Type:SISO")
    public Map<String, Object> getSecurityInfo(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        MultipartFile inputFile;

        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
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
