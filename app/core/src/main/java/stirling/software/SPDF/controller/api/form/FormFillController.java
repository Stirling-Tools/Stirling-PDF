package stirling.software.SPDF.controller.api.form;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import com.opencsv.CSVWriter;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.FormFieldWithCoordinates;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@ApplicationScoped
@Path("/api/v1/form")
@Tag(
        name = "Forms",
        description =
                """
                Work with PDF form fields: read them, fill them, edit them, or remove them.
                Treats a PDF as a structured form instead of just flat pages.

                Typical uses:
                • Inspect which form fields exist in a PDF
                • Autofill forms from your own systems (e.g. CRM, ERP)
                • Change or delete form fields before sending out a final, non-editable copy
                • Unlock read-only form fields when you need to update them
                """)
@RequiredArgsConstructor
public class FormFillController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;
    private final TempFileManager tempFileManager;

    private Response saveDocument(PDDocument document, String baseName) throws IOException {
        return WebResponseUtils.pdfDocToWebResponse(document, baseName + ".pdf", tempFileManager);
    }

    private static String buildBaseName(MultipartFile file, String suffix) {
        String original = Filenames.toSimpleFileName(file.getOriginalFilename());
        if (original == null || original.isBlank()) {
            original = "document";
        }
        if (!original.toLowerCase().endsWith(".pdf")) {
            return original + "_" + suffix;
        }
        String withoutExtension = original.substring(0, original.length() - 4);
        return withoutExtension + "_" + suffix;
    }

    private static void requirePdf(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "{0} must be in PDF format", "file");
        }
    }

    // Read a JSON/text multipart part as a raw UTF-8 string. The part is bound as FileUpload rather
    // than byte[]/String on purpose: clients send these parts with Content-Type: application/json,
    // and RESTEasy then routes a byte[]/String target through the Jackson reader, which fails
    // trying
    // to deserialize a JSON object (e.g. "{}") into those types and surfaces as a 500. FileUpload
    // is
    // always read verbatim, so the raw bytes reach the parser below regardless of the part's
    // declared content type. An absent or empty part yields null (the no-op path).
    private static String decodePart(FileUpload upload) throws IOException {
        MultipartFile part = FileUploadMultipartFile.of(upload);
        if (part == null || part.isEmpty()) {
            return null;
        }
        byte[] bytes = part.getBytes();
        if (bytes == null || bytes.length == 0) {
            return null;
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    @POST
    @Path("/fields")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Inspect PDF form fields",
            description = "Returns metadata describing each field in the provided PDF form")
    public Response listFields(@RestForm("file") FileUpload fileUpload) throws IOException {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);
        requirePdf(file);
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            FormUtils.repairMissingWidgetPageReferences(document);
            FormUtils.FormFieldExtraction extraction =
                    FormUtils.extractFieldsWithTemplate(document);
            return Response.ok(extraction).build();
        }
    }

    @POST
    @Path("/fields-with-coordinates")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Inspect PDF form fields with widget coordinates",
            description =
                    "Returns metadata describing each field in the provided PDF form, "
                            + "including precise widget coordinates for interactive rendering")
    public Response listFieldsWithCoordinates(@RestForm("file") FileUpload fileUpload)
            throws IOException {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);
        requirePdf(file);
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            FormUtils.repairMissingWidgetPageReferences(document);
            List<FormFieldWithCoordinates> fields =
                    FormUtils.extractFormFieldsWithCoordinates(document);
            return Response.ok(fields).build();
        }
    }

    @POST
    @Path("/extract-csv")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Extract form fields as CSV",
            description =
                    "Returns a CSV file containing all form field names and their current values")
    public Response extractCsv(
            @RestForm("file") FileUpload fileUpload, @RestForm("data") FileUpload dataUpload)
            throws IOException {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);
        MultipartFile data = FileUploadMultipartFile.of(dataUpload);
        requirePdf(file);
        try (PDDocument document = pdfDocumentFactory.load(file, true);
                StringWriter sw = new StringWriter()) {

            FormUtils.repairMissingWidgetPageReferences(document);

            if (data != null && !data.isEmpty()) {
                Map<String, String> values =
                        objectMapper.readValue(
                                data.getInputStream(), new TypeReference<Map<String, String>>() {});
                FormUtils.applyFieldValues(document, values, false);
            }

            List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(document);

            try (CSVWriter csvWriter = new CSVWriter(sw)) {
                String[] header = {"Field Name", "Value"};
                csvWriter.writeNext(header);

                for (FormUtils.FormFieldInfo field : fields) {
                    csvWriter.writeNext(new String[] {field.name(), field.value()});
                }
            }

            byte[] csvBytes = sw.toString().getBytes(StandardCharsets.UTF_8);
            String baseName = buildBaseName(file, "extracted");
            return WebResponseUtils.bytesToWebResponse(
                    csvBytes, baseName + ".csv", MediaType.valueOf("text/csv"));
        }
    }

    @POST
    @Path("/extract-xlsx")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Extract form fields as XLSX",
            description =
                    "Returns an Excel (XLSX) file containing all form field names and their current values")
    public Response extractXlsx(
            @RestForm("file") FileUpload fileUpload, @RestForm("data") FileUpload dataUpload)
            throws IOException {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);
        MultipartFile data = FileUploadMultipartFile.of(dataUpload);
        requirePdf(file);
        try (PDDocument document = pdfDocumentFactory.load(file, true);
                Workbook workbook = new XSSFWorkbook();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {

            FormUtils.repairMissingWidgetPageReferences(document);

            if (data != null && !data.isEmpty()) {
                Map<String, String> values =
                        objectMapper.readValue(
                                data.getInputStream(), new TypeReference<Map<String, String>>() {});
                FormUtils.applyFieldValues(document, values, false);
            }

            List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(document);
            Sheet sheet = workbook.createSheet("Form Fields");

            // Header row
            Row headerRow = sheet.createRow(0);
            headerRow.createCell(0).setCellValue("Field Name");
            headerRow.createCell(1).setCellValue("Value");

            // Data rows
            int rowNum = 1;
            for (FormUtils.FormFieldInfo field : fields) {
                Row row = sheet.createRow(rowNum++);
                row.createCell(0).setCellValue(field.name());
                row.createCell(1).setCellValue(FormUtils.safeValue(field.value()));
            }

            // Auto-size columns
            sheet.autoSizeColumn(0);
            sheet.autoSizeColumn(1);

            workbook.write(baos);
            String baseName = buildBaseName(file, "extracted");
            return WebResponseUtils.bytesToWebResponse(
                    baos.toByteArray(),
                    baseName + ".xlsx",
                    MediaType.valueOf(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        }
    }

    @POST
    @Path("/modify-fields")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Modify existing form fields",
            description =
                    "Updates existing fields in the provided PDF and returns the updated file")
    public Response modifyFields(
            @RestForm("file") FileUpload fileUpload, @RestForm("updates") FileUpload updatesUpload)
            throws IOException {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);
        String rawUpdates = decodePart(updatesUpload);
        List<FormUtils.ModifyFormFieldDefinition> modifications =
                FormPayloadParser.parseModificationDefinitions(objectMapper, rawUpdates);
        if (modifications.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dataRequired",
                    "{0} must contain at least one definition",
                    "updates payload");
        }

        return processSingleFile(
                file, "updated", document -> FormUtils.modifyFormFields(document, modifications));
    }

    @POST
    @Path("/delete-fields")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Delete form fields",
            description = "Removes the specified fields from the PDF and returns the updated file")
    public Response deleteFields(
            @RestForm("file") FileUpload fileUpload, @RestForm("names") FileUpload namesUpload)
            throws IOException {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);
        String rawNames = decodePart(namesUpload);
        List<String> names = FormPayloadParser.parseNameList(objectMapper, rawNames);
        if (names.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dataRequired", "{0} must contain at least one value", "names payload");
        }

        return processSingleFile(
                file, "updated", document -> FormUtils.deleteFormFields(document, names));
    }

    @POST
    @Path("/fill")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Operation(
            summary = "Fill PDF form fields",
            description =
                    "Populates the supplied PDF form using values from the provided JSON payload"
                            + " and returns the filled PDF")
    public Response fillForm(
            @RestForm("file") FileUpload fileUpload,
            @RestForm("data") FileUpload dataUpload,
            @RestForm("flatten") @DefaultValue("false") boolean flatten)
            throws IOException {

        MultipartFile file = FileUploadMultipartFile.of(fileUpload);
        String rawValues = decodePart(dataUpload);
        Map<String, Object> values = FormPayloadParser.parseValueMap(objectMapper, rawValues);

        return processSingleFile(
                file,
                "filled",
                document -> FormUtils.applyFieldValues(document, values, flatten, true));
    }

    private Response processSingleFile(
            MultipartFile file, String suffix, DocumentProcessor processor) throws IOException {
        requirePdf(file);

        String baseName = buildBaseName(file, suffix);
        try (PDDocument document = pdfDocumentFactory.load(file)) {
            FormUtils.repairMissingWidgetPageReferences(document);
            processor.accept(document);
            return saveDocument(document, baseName);
        }
    }

    @FunctionalInterface
    private interface DocumentProcessor {
        void accept(PDDocument document) throws IOException;
    }
}
