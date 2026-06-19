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
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.JsonDataResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.AnalysisApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;

@AnalysisApi
@Path("/api/v1/analysis")
@ApplicationScoped
@RequiredArgsConstructor
public class AnalysisController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    // Builds the existing PDFFile request model from inbound multipart form fields.
    // PDFFile.fileInput is not (yet) annotated with @RestForm, so the controller binds the
    // form fields itself and adapts the FileUpload via FileUploadMultipartFile.of(...).
    private PDFFile toPdfFile(FileUpload fileInput, String fileId) {
        PDFFile file = new PDFFile();
        file.setFileInput(FileUploadMultipartFile.of(fileInput));
        file.setFileId(fileId);
        return file;
    }

    @POST
    @Path("/page-count")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/page-count",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JsonDataResponse
    @Operation(
            summary = "Get PDF page count",
            description = "Returns total number of pages in PDF. Input:PDF Output:JSON Type:SISO")
    public Response getPageCount(
            @RestForm("fileInput") FileUpload fileInput, @RestForm("fileId") String fileId)
            throws IOException {
        PDFFile file = toPdfFile(fileInput, fileId);
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            return Response.ok(Map.of("pageCount", document.getNumberOfPages())).build();
        }
    }

    @POST
    @Path("/basic-info")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/basic-info",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JsonDataResponse
    @Operation(
            summary = "Get basic PDF information",
            description = "Returns page count, version, file size. Input:PDF Output:JSON Type:SISO")
    public Response getBasicInfo(
            @RestForm("fileInput") FileUpload fileInput, @RestForm("fileId") String fileId)
            throws IOException {
        PDFFile file = toPdfFile(fileInput, fileId);
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            Map<String, Object> info = new HashMap<>();
            info.put("pageCount", document.getNumberOfPages());
            info.put("pdfVersion", document.getVersion());
            info.put("fileSize", file.getFileInput().getSize());
            return Response.ok(info).build();
        }
    }

    @POST
    @Path("/document-properties")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/document-properties",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JsonDataResponse
    @Operation(
            summary = "Get PDF document properties",
            description = "Returns title, author, subject, etc. Input:PDF Output:JSON Type:SISO")
    public Response getDocumentProperties(
            @RestForm("fileInput") FileUpload fileInput, @RestForm("fileId") String fileId)
            throws IOException {
        PDFFile file = toPdfFile(fileInput, fileId);
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
            return Response.ok(properties).build();
        }
    }

    @POST
    @Path("/page-dimensions")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/page-dimensions",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JsonDataResponse
    @Operation(
            summary = "Get page dimensions for all pages",
            description = "Returns width and height of each page. Input:PDF Output:JSON Type:SISO")
    public Response getPageDimensions(
            @RestForm("fileInput") FileUpload fileInput, @RestForm("fileId") String fileId)
            throws IOException {
        PDFFile file = toPdfFile(fileInput, fileId);
        try (PDDocument document = pdfDocumentFactory.load(file.getFileInput())) {
            List<Map<String, Float>> dimensions = new ArrayList<>();
            PDPageTree pages = document.getPages();

            for (PDPage page : pages) {
                Map<String, Float> pageDim = new HashMap<>();
                pageDim.put("width", page.getBBox().getWidth());
                pageDim.put("height", page.getBBox().getHeight());
                dimensions.add(pageDim);
            }
            return Response.ok(dimensions).build();
        }
    }

    @POST
    @Path("/form-fields")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/form-fields",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JsonDataResponse
    @Operation(
            summary = "Get form field information",
            description =
                    "Returns count and details of form fields. Input:PDF Output:JSON Type:SISO")
    public Response getFormFields(
            @RestForm("fileInput") FileUpload fileInput, @RestForm("fileId") String fileId)
            throws IOException {
        PDFFile file = toPdfFile(fileInput, fileId);
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
            return Response.ok(formInfo).build();
        }
    }

    @POST
    @Path("/annotation-info")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/annotation-info",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JsonDataResponse
    @Operation(
            summary = "Get annotation information",
            description = "Returns count and types of annotations. Input:PDF Output:JSON Type:SISO")
    public Response getAnnotationInfo(
            @RestForm("fileInput") FileUpload fileInput, @RestForm("fileId") String fileId)
            throws IOException {
        PDFFile file = toPdfFile(fileInput, fileId);
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
            return Response.ok(annotInfo).build();
        }
    }

    @POST
    @Path("/font-info")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/font-info",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JsonDataResponse
    @Operation(
            summary = "Get font information",
            description =
                    "Returns list of fonts used in the document. Input:PDF Output:JSON Type:SISO")
    public Response getFontInfo(
            @RestForm("fileInput") FileUpload fileInput, @RestForm("fileId") String fileId)
            throws IOException {
        PDFFile file = toPdfFile(fileInput, fileId);
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
            return Response.ok(fontInfo).build();
        }
    }

    @POST
    @Path("/security-info")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            value = "/security-info",
            consumes = MediaType.MULTIPART_FORM_DATA,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JsonDataResponse
    @Operation(
            summary = "Get security information",
            description =
                    "Returns encryption and permission details. Input:PDF Output:JSON Type:SISO")
    public Response getSecurityInfo(
            @RestForm("fileInput") FileUpload fileInput, @RestForm("fileId") String fileId)
            throws IOException {
        PDFFile file = toPdfFile(fileInput, fileId);
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

            return Response.ok(securityInfo).build();
        }
    }
}
