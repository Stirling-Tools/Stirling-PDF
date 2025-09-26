package stirling.software.SPDF.controller.api.form;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.multipdf.PDFMergerUtility;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.FormUtils;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/form")
@Tag(name = "Forms", description = "PDF form APIs")
@RequiredArgsConstructor
@Slf4j
public class FormFillController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;

    @PostMapping(value = "/fields", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Inspect PDF form fields",
            description = "Returns metadata describing each field in the provided PDF form")
    public ResponseEntity<List<FormUtils.FormFieldInfo>> listFields(
            @RequestParam("file") MultipartFile file) throws IOException {

        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            List<FormUtils.FormFieldInfo> fields = FormUtils.extractFormFields(document);
            return ResponseEntity.ok(fields);
        }
    }

    @PostMapping(value = "/fill", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Fill PDF form fields",
            description =
                    "Populates the supplied PDF form using values from the provided JSON payload"
                            + " and returns the filled PDF")
    public ResponseEntity<byte[]> fillForm(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "data", required = false) String rawValues,
            @RequestParam(value = "flatten", defaultValue = "false") boolean flatten)
            throws IOException {

        Map<String, Object> values = parseValueMap(rawValues);
        String baseName = buildBaseName(file, "filled");

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            FormUtils.applyFieldValues(document, values, flatten);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return WebResponseUtils.bytesToWebResponse(baos.toByteArray(), baseName + ".pdf");
        }
    }

    @PostMapping(value = "/mail-merge", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Generate multiple filled PDFs",
            description =
                    "Applies the provided JSON data to one or more PDF forms and returns a"
                            + " combined PDF")
    public ResponseEntity<byte[]> mailMerge(
            @RequestParam("file") MultipartFile[] files,
            @RequestParam(value = "records", required = false) String rawRecords,
            @RequestParam(value = "recordsFile", required = false) MultipartFile recordsFile,
            @RequestParam(value = "flatten", defaultValue = "false") boolean flatten)
            throws IOException {

        if (files == null || files.length == 0) {
            throw new IllegalArgumentException("At least one PDF form must be provided");
        }

        List<Map<String, Object>> records = resolveRecords(rawRecords, recordsFile);

        String baseName = buildBaseName(files[0], "merge");

        PDFMergerUtility mergerUtility = new PDFMergerUtility();
        try (PDDocument mergedDocument = pdfDocumentFactory.createNewDocument()) {
            if (files.length == 1) {
                byte[] templateBytes = files[0].getBytes();
                for (Map<String, Object> record : records) {
                    appendFilledDocument(
                            templateBytes, record, flatten, mergerUtility, mergedDocument);
                }
            } else {
                if (records.size() == files.length) {
                    for (int i = 0; i < files.length; i++) {
                        appendFilledDocument(
                                files[i].getBytes(),
                                records.get(i),
                                flatten,
                                mergerUtility,
                                mergedDocument);
                    }
                } else if (records.size() == 1) {
                    Map<String, Object> sharedRecord = records.get(0);
                    for (MultipartFile pdf : files) {
                        appendFilledDocument(
                                pdf.getBytes(),
                                sharedRecord,
                                flatten,
                                mergerUtility,
                                mergedDocument);
                    }
                } else {
                    throw new IllegalArgumentException(
                            "When uploading multiple PDFs, provide either one JSON object to apply to"
                                    + " every PDF or a JSON array with the same number of objects as PDFs");
                }
            }

            ByteArrayOutputStream mergedOutput = new ByteArrayOutputStream();
            mergedDocument.save(mergedOutput);

            return WebResponseUtils.bytesToWebResponse(
                    mergedOutput.toByteArray(), baseName + ".pdf");
        }
    }

    private void appendFilledDocument(
            byte[] templateBytes,
            Map<String, Object> values,
            boolean flatten,
            PDFMergerUtility mergerUtility,
            PDDocument mergedDocument)
            throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(templateBytes)) {
            FormUtils.applyFieldValues(document, values, flatten);
            mergerUtility.appendDocument(mergedDocument, document);
        }
    }

    private Map<String, Object> parseValueMap(String json) throws IOException {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        return objectMapper.readValue(json, new TypeReference<>() {});
    }

    private List<Map<String, Object>> parseRecordArray(String json) throws IOException {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        return objectMapper.readValue(json, new TypeReference<>() {});
    }

    private List<Map<String, Object>> resolveRecords(String inlineJson, MultipartFile recordsFile)
            throws IOException {
        if (recordsFile != null && !recordsFile.isEmpty()) {
            String fileJson = new String(recordsFile.getBytes());
            List<Map<String, Object>> parsed = parseRecordArray(fileJson);
            if (parsed.isEmpty()) {
                throw new IllegalArgumentException(
                        "records file must contain a JSON array with at least one object");
            }
            return parsed;
        }

        List<Map<String, Object>> parsed = parseRecordArray(inlineJson);
        if (parsed.isEmpty()) {
            throw new IllegalArgumentException("records payload must contain at least one object");
        }
        return parsed;
    }

    private String buildBaseName(MultipartFile file, String suffix) {
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
}
