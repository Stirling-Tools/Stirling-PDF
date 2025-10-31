package stirling.software.SPDF.controller.api.form;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/form")
@Tag(name = "Forms", description = "PDF form APIs")
@RequiredArgsConstructor
public class FormFillController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;

    private static ResponseEntity<byte[]> saveDocument(PDDocument document, String baseName)
            throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        document.save(baos);
        return WebResponseUtils.bytesToWebResponse(baos.toByteArray(), baseName + ".pdf");
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

    private static void requirePdf(MultipartFile file, String parameterName) {
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "{0} must be in PDF format", parameterName);
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

        requirePdf(file, "file");
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            FormUtils.FormFieldExtraction extraction =
                    FormUtils.extractFieldsWithTemplate(document);
            return ResponseEntity.ok(extraction);
        }
    }

    @PostMapping(value = "/modify-fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Modify existing form fields",
            description =
                    "Updates existing fields in the provided PDF and returns the updated file")
    public ResponseEntity<byte[]> modifyFields(
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

        return processSingleFile(
                file, "updated", document -> FormUtils.modifyFormFields(document, modifications));
    }

    @PostMapping(value = "/delete-fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Delete form fields",
            description = "Removes the specified fields from the PDF and returns the updated file")
    public ResponseEntity<byte[]> deleteFields(
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

        return processSingleFile(
                file, "updated", document -> FormUtils.deleteFormFields(document, names));
    }

    @PostMapping(value = "/fill", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Fill PDF form fields",
            description =
                    "Populates the supplied PDF form using values from the provided JSON payload"
                            + " and returns the filled PDF")
    public ResponseEntity<byte[]> fillForm(
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

    private ResponseEntity<byte[]> processSingleFile(
            MultipartFile file, String suffix, DocumentProcessor processor) throws IOException {
        requirePdf(file, "file");

        String baseName = buildBaseName(file, suffix);
        try (PDDocument document = pdfDocumentFactory.load(file)) {
            processor.accept(document);
            return saveDocument(document, baseName);
        }
    }

    @FunctionalInterface
    private interface DocumentProcessor {
        void accept(PDDocument document) throws IOException;
    }
}
