package stirling.software.SPDF.controller.api.form;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.opencsv.CSVWriter;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.FormFieldWithCoordinates;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/v1/form")
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

    /** Carries the edits a request asked for but the document could not take, as base64 JSON. */
    public static final String SKIPPED_EDITS_HEADER = "X-Stirling-Skipped-Field-Edits";

    /** How many were skipped in total, which may exceed the number listed in the header above. */
    public static final String SKIPPED_EDITS_TOTAL_HEADER = "X-Stirling-Skipped-Field-Edits-Total";

    /** Keeps the header well inside Jetty's response-header budget. */
    private static final int MAX_REPORTED_SKIPS = 20;

    /** Bytes of encoded header value, well under the container's limit for the whole header set. */
    private static final int MAX_SKIP_HEADER_BYTES = 4096;

    private static final int MAX_SKIP_FIELD_CHARS = 120;

    /** Entry names inside the {@code ?includeFields=true} bundle. */
    private static final String FIELDS_ENTRY = "fields.json";

    private static final String DOCUMENT_ENTRY = "document.pdf";

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;
    private final TempFileManager tempFileManager;

    private ResponseEntity<Resource> saveDocument(PDDocument document, String baseName)
            throws IOException {
        return WebResponseUtils.pdfDocToWebResponse(document, baseName + ".pdf", tempFileManager);
    }

    /**
     * Rejects field names PDFBox cannot store before the document is touched, so the caller gets a
     * 400 naming the offending character instead of a 200 with the field quietly missing.
     */
    private static void requireUsableFieldNames(
            List<FormUtils.NewFormFieldDefinition> adds,
            List<FormUtils.ModifyFormFieldDefinition> modifies) {
        Stream<String> problems =
                Stream.concat(
                        adds.stream()
                                .map(FormUtils.NewFormFieldDefinition::name)
                                .map(FormUtils::invalidFieldNameReason),
                        // A rename to the same name is not a rename, so a nested field whose
                        // qualified name already contains a period is left alone.
                        modifies.stream()
                                .map(m -> FormUtils.renameProblem(m.targetName(), m.name())));
        problems.filter(Objects::nonNull)
                .findFirst()
                .ifPresent(
                        reason -> {
                            throw ExceptionUtils.createIllegalArgumentException(
                                    "error.invalidArgument", "{0}", reason);
                        });
    }

    /**
     * The body is the updated PDF, so dropped edits travel as a base64 JSON header;
     * percent-encoding would turn every space into a plus sign.
     */
    private ResponseEntity<Resource> withSkippedEdits(
            ResponseEntity<Resource> response, List<FormUtils.SkippedFieldEdit> skipped) {
        if (skipped.isEmpty()) {
            return response;
        }
        // A count cap alone is not enough: one very long field name can still overflow the
        // header budget and turn the response into an error page, losing the edited PDF.
        List<FormUtils.SkippedFieldEdit> reported = new ArrayList<>();
        String encoded = "";
        for (FormUtils.SkippedFieldEdit edit : skipped) {
            if (reported.size() >= MAX_REPORTED_SKIPS) {
                break;
            }
            reported.add(
                    new FormUtils.SkippedFieldEdit(
                            edit.operation(),
                            FormUtils.abbreviate(edit.target(), MAX_SKIP_FIELD_CHARS),
                            FormUtils.abbreviate(edit.reason(), MAX_SKIP_FIELD_CHARS)));
            String candidate =
                    Base64.getEncoder()
                            .encodeToString(
                                    objectMapper
                                            .writeValueAsString(reported)
                                            .getBytes(StandardCharsets.UTF_8));
            if (candidate.length() > MAX_SKIP_HEADER_BYTES) {
                reported.removeLast();
                break;
            }
            encoded = candidate;
        }
        return ResponseEntity.status(response.getStatusCode())
                .headers(response.getHeaders())
                .header(SKIPPED_EDITS_TOTAL_HEADER, String.valueOf(skipped.size()))
                .header(SKIPPED_EDITS_HEADER, encoded)
                .body(response.getBody());
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

    private static String decodePart(byte[] payload) {
        if (payload == null || payload.length == 0) {
            return null;
        }
        return new String(payload, StandardCharsets.UTF_8);
    }

    @PostMapping(value = "/fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Inspect PDF form fields",
            description = "Returns metadata describing each field in the provided PDF form")
    public ResponseEntity<FormUtils.FormFieldExtraction> listFields(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file)
            throws IOException {

        requirePdf(file);
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            FormUtils.repairMissingWidgetPageReferences(document);
            FormUtils.FormFieldExtraction extraction =
                    FormUtils.extractFieldsWithTemplate(document);
            return ResponseEntity.ok(extraction);
        }
    }

    @PostMapping(value = "/fields-with-coordinates", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Inspect PDF form fields with widget coordinates",
            description =
                    "Returns metadata describing each field in the provided PDF form, "
                            + "including precise widget coordinates for interactive rendering")
    public ResponseEntity<List<FormFieldWithCoordinates>> listFieldsWithCoordinates(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file)
            throws IOException {

        requirePdf(file);
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            FormUtils.repairMissingWidgetPageReferences(document);
            List<FormFieldWithCoordinates> fields =
                    FormUtils.extractFormFieldsWithCoordinates(document);
            return ResponseEntity.ok(fields);
        }
    }

    @PostMapping(value = "/extract-csv", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Extract form fields as CSV",
            description =
                    "Returns a CSV file containing all form field names and their current values")
    public ResponseEntity<byte[]> extractCsv(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file,
            @RequestParam(value = "data", required = false) MultipartFile data)
            throws IOException {

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
                    csvBytes, baseName + ".csv", MediaType.parseMediaType("text/csv"));
        }
    }

    @PostMapping(value = "/extract-xlsx", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Extract form fields as XLSX",
            description =
                    "Returns an Excel (XLSX) file containing all form field names and their current"
                            + " values")
    public ResponseEntity<byte[]> extractXlsx(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file,
            @RequestParam(value = "data", required = false) MultipartFile data)
            throws IOException {

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
                    MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        }
    }

    @PostMapping(value = "/add-fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Add new form fields",
            description =
                    "Creates new form fields in the provided PDF and returns the updated file")
    public ResponseEntity<Resource> addFields(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file,
            @Parameter(
                            description = "JSON array of new field definitions",
                            example =
                                    "[{\"name\":\"NewField\",\"type\":\"text\",\"pageIndex\":0,"
                                            + "\"x\":50,\"y\":700,\"width\":200,\"height\":20}]")
                    @RequestPart(value = "fields", required = false)
                    byte[] fieldsPayload)
            throws IOException {

        String rawFields = decodePart(fieldsPayload);
        List<FormUtils.NewFormFieldDefinition> definitions =
                FormPayloadParser.parseNewFieldDefinitions(objectMapper, rawFields);
        if (definitions.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dataRequired",
                    "{0} must contain at least one definition",
                    "fields payload");
        }

        requireUsableFieldNames(definitions, List.of());

        List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
        return withSkippedEdits(
                processSingleFile(
                        file,
                        "updated",
                        document -> FormUtils.addNewFields(document, definitions, skipped)),
                skipped);
    }

    @PostMapping(value = "/edit-fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Apply a batch of form field edits",
            description =
                    "Adds, modifies, and deletes form fields in a single request (one document"
                            + " load/save) and returns the updated file")
    public ResponseEntity<Resource> editFields(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file,
            @Parameter(
                            description =
                                    "JSON object with optional 'add', 'modify' and 'delete'"
                                            + " sections",
                            example =
                                    "{\"add\":[{\"name\":\"f\",\"type\":\"text\",\"pageIndex\":0,"
                                            + "\"x\":50,\"y\":700,\"width\":200,\"height\":20}],"
                                            + "\"modify\":[],\"delete\":[]}")
                    @RequestPart(value = "edits", required = false)
                    byte[] editsPayload,
            @Parameter(
                            description =
                                    "Return a ZIP holding the updated PDF plus the field list it"
                                            + " produced, instead of the bare PDF. Saves re-uploading"
                                            + " the result just to read its fields back.")
                    @RequestParam(value = "includeFields", defaultValue = "false")
                    boolean includeFields)
            throws IOException {

        String rawEdits = decodePart(editsPayload);
        FormUtils.FieldEditBatch batch = FormPayloadParser.parseFieldEdits(objectMapper, rawEdits);
        if (batch.add().isEmpty() && batch.modify().isEmpty() && batch.delete().isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dataRequired", "{0} must contain at least one edit", "edits payload");
        }
        requireUsableFieldNames(batch.add(), batch.modify());

        List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
        return withSkippedEdits(
                processSingleFile(
                        file,
                        "updated",
                        includeFields,
                        document ->
                                FormUtils.applyFieldEdits(
                                        document,
                                        batch.add(),
                                        batch.modify(),
                                        batch.delete(),
                                        skipped)),
                skipped);
    }

    @PostMapping(value = "/modify-fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Modify existing form fields",
            description =
                    "Updates existing fields in the provided PDF and returns the updated file")
    public ResponseEntity<Resource> modifyFields(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file,
            @RequestPart(value = "updates", required = false) byte[] updatesPayload)
            throws IOException {

        String rawUpdates = decodePart(updatesPayload);
        List<FormUtils.ModifyFormFieldDefinition> modifications =
                FormPayloadParser.parseModificationDefinitions(objectMapper, rawUpdates);
        if (modifications.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dataRequired",
                    "{0} must contain at least one definition",
                    "updates payload");
        }

        requireUsableFieldNames(List.of(), modifications);

        List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
        return withSkippedEdits(
                processSingleFile(
                        file,
                        "updated",
                        document -> FormUtils.modifyFormFields(document, modifications, skipped)),
                skipped);
    }

    @PostMapping(value = "/delete-fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Delete form fields",
            description = "Removes the specified fields from the PDF and returns the updated file")
    public ResponseEntity<Resource> deleteFields(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file,
            @Parameter(
                            description =
                                    "JSON array of field names or objects with a name property,"
                                            + " matching the /fields response format",
                            example = "[{\"name\":\"Field1\"}]")
                    @RequestPart(value = "names", required = false)
                    byte[] namesPayload)
            throws IOException {

        String rawNames = decodePart(namesPayload);
        List<String> names = FormPayloadParser.parseNameList(objectMapper, rawNames);
        if (names.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dataRequired", "{0} must contain at least one value", "names payload");
        }

        List<FormUtils.SkippedFieldEdit> skipped = new ArrayList<>();
        return withSkippedEdits(
                processSingleFile(
                        file,
                        "updated",
                        document -> FormUtils.deleteFormFields(document, names, skipped)),
                skipped);
    }

    @PostMapping(value = "/fill", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Fill PDF form fields",
            description =
                    "Populates the supplied PDF form using values from the provided JSON payload"
                            + " and returns the filled PDF")
    public ResponseEntity<Resource> fillForm(
            @Parameter(
                            description = "The input PDF file",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file,
            @Parameter(
                            description = "JSON object of field-value pairs to apply",
                            example = "{\"field\":\"value\"}")
                    @RequestPart(value = "data", required = false)
                    byte[] valuesPayload,
            @RequestParam(value = "flatten", defaultValue = "false") boolean flatten)
            throws IOException {

        String rawValues = decodePart(valuesPayload);
        Map<String, Object> values = FormPayloadParser.parseValueMap(objectMapper, rawValues);

        return processSingleFile(
                file,
                "filled",
                document -> FormUtils.applyFieldValues(document, values, flatten, true));
    }

    private ResponseEntity<Resource> processSingleFile(
            MultipartFile file, String suffix, DocumentProcessor processor) throws IOException {
        return processSingleFile(file, suffix, false, processor);
    }

    private ResponseEntity<Resource> processSingleFile(
            MultipartFile file, String suffix, boolean includeFields, DocumentProcessor processor)
            throws IOException {
        requirePdf(file);

        String baseName = buildBaseName(file, suffix);
        try (PDDocument document = pdfDocumentFactory.load(file)) {
            FormUtils.repairMissingWidgetPageReferences(document);
            processor.accept(document);
            return includeFields
                    ? saveDocumentWithFields(document, baseName)
                    : saveDocument(document, baseName);
        }
    }

    /**
     * Answers "what fields does the saved file have?" from the document still open here, so the
     * caller does not have to upload the result back to ask.
     */
    private ResponseEntity<Resource> saveDocumentWithFields(PDDocument document, String baseName)
            throws IOException {
        TempFile zip = null;
        boolean zipTransferred = false;
        try (TempFile pdf = tempFileManager.createManagedTempFile(".pdf")) {
            document.save(pdf.getFile());
            // Read the fields after the save so they describe the bytes actually being returned.
            byte[] fields =
                    objectMapper.writeValueAsBytes(
                            FormUtils.extractFormFieldsWithCoordinates(document));
            zip = tempFileManager.createManagedTempFile(".zip");
            writeFieldBundle(zip.getPath(), pdf.getPath(), fields);
            ResponseEntity<Resource> response =
                    WebResponseUtils.zipFileToWebResponse(zip, baseName + ".zip");
            zipTransferred = true;
            return response;
        } finally {
            if (zip != null && !zipTransferred) {
                zip.close();
            }
        }
    }

    /**
     * Deflates the JSON because it is text, but stores the PDF: its streams are already compressed,
     * so deflating costs ~25ms per MB to save a few percent.
     */
    private static void writeFieldBundle(Path zipPath, Path pdfPath, byte[] fields)
            throws IOException {
        long pdfSize = Files.size(pdfPath);
        CRC32 crc = new CRC32();
        try (InputStream in = Files.newInputStream(pdfPath)) {
            byte[] buffer = new byte[8192];
            for (int read; (read = in.read(buffer)) != -1; ) {
                crc.update(buffer, 0, read);
            }
        }
        try (ZipOutputStream zip = new ZipOutputStream(Files.newOutputStream(zipPath))) {
            ZipEntry fieldsEntry = new ZipEntry(FIELDS_ENTRY);
            fieldsEntry.setMethod(ZipEntry.DEFLATED);
            zip.putNextEntry(fieldsEntry);
            zip.write(fields);
            zip.closeEntry();

            ZipEntry documentEntry = new ZipEntry(DOCUMENT_ENTRY);
            documentEntry.setMethod(ZipEntry.STORED);
            documentEntry.setSize(pdfSize);
            documentEntry.setCompressedSize(pdfSize);
            documentEntry.setCrc(crc.getValue());
            zip.putNextEntry(documentEntry);
            Files.copy(pdfPath, zip);
            zip.closeEntry();
            zip.finish();
        }
    }

    @FunctionalInterface
    private interface DocumentProcessor {
        void accept(PDDocument document) throws IOException;
    }
}
