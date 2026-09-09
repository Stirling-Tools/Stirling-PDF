package stirling.software.proprietary.integration.purview;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.integration.api.ApiConnectionResolver;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.integration.purview.SensitivityLabel.AssignmentMethod;
import stirling.software.proprietary.service.AiToolResponseHeaders;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Purview sensitivity labelling as policy steps.
 *
 * <p>Both steps are local: a label is metadata, so applying and reading one involves no call to
 * Microsoft. The connection supplies the tenant id that becomes the label's {@code SiteId}.
 *
 * <p>{@code purview-read-label} exists to make labels <em>actionable</em>: it reports what a
 * document already carries, so a policy can branch on it - the case Purview itself does not cover,
 * since it labels documents but does not process them.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/integration")
@RequiredArgsConstructor
@Tag(name = "Integrations", description = "Third-party integration steps.")
public class PurviewLabelController {

    private final ApiConnectionResolver connectionResolver;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final ObjectMapper objectMapper;

    @PostMapping(value = "/purview-apply-label", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Apply a Microsoft Purview sensitivity label",
            description =
                    "Writes the Purview label metadata (MSIP_Label_<GUID>_*) onto the PDF, so"
                            + " Purview-aware tools recognise the label. Applies the label only;"
                            + " it cannot encrypt, which requires the Microsoft client."
                            + " Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> applyLabel(
            @RequestParam("fileInput") MultipartFile fileInput,
            @RequestParam("connectionId") String connectionId,
            @RequestParam("labelId") String labelId,
            @RequestParam(value = "labelName", required = false) String labelName,
            @RequestParam(value = "method", defaultValue = "STANDARD") String method,
            @RequestParam(value = "contentBits", required = false) Integer contentBits)
            throws IOException {

        PurviewConnectionSettings settings = settings(connectionId);
        AssignmentMethod assignment = parseMethod(method);

        try (PDDocument document = pdfDocumentFactory.load(fileInput, true)) {
            String fileName = safeFileName(fileInput.getOriginalFilename());
            SensitivityLabel label =
                    new SensitivityLabel(
                            labelId.trim(),
                            labelName,
                            settings.tenantId(),
                            assignment,
                            Instant.now(),
                            contentBits);
            PdfSensitivityLabels.apply(document, label);
            log.debug("[purview-apply-label] labelled {} as {}", fileName, labelId);
            return WebResponseUtils.pdfDocToWebResponse(document, fileName, tempFileManager);
        }
    }

    @PostMapping(value = "/purview-read-label", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Read the Microsoft Purview sensitivity label on a PDF",
            description =
                    "Reports the Purview labels a PDF already carries so a policy can act on"
                            + " them. The document passes through unchanged."
                            + " Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> readLabel(
            @RequestParam("fileInput") MultipartFile fileInput,
            @RequestParam("connectionId") String connectionId)
            throws IOException {

        PurviewConnectionSettings settings = settings(connectionId);

        List<SensitivityLabel> labels;
        try (PDDocument document = pdfDocumentFactory.load(fileInput, true)) {
            labels = PdfSensitivityLabels.readAll(document);
        }
        // The document is returned byte-for-byte rather than re-saved: a read must not perturb the
        // file it inspected, and a PDFBox round-trip would rewrite its structure.
        byte[] bytes = fileInput.getBytes();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_PDF);
        headers.setContentDispositionFormData(
                "attachment", safeFileName(fileInput.getOriginalFilename()));
        headers.setContentLength(bytes.length);
        headers.set(AiToolResponseHeaders.TOOL_REPORT, buildReport(labels, settings));
        return ResponseEntity.ok().headers(headers).body(new ByteArrayResource(bytes));
    }

    /**
     * The labels found, and which of them is this tenant's - a document can carry labels from
     * several organisations, and only the matching one reflects this tenant's policy.
     */
    private String buildReport(List<SensitivityLabel> labels, PurviewConnectionSettings settings) {
        Optional<SensitivityLabel> own =
                labels.stream()
                        .filter(label -> settings.tenantId().equalsIgnoreCase(label.siteId()))
                        .findFirst();
        ObjectNode report = objectMapper.createObjectNode();
        report.put("labelled", own.isPresent());
        own.ifPresent(
                label -> {
                    report.put("labelId", label.labelId());
                    report.put("labelName", label.name());
                    report.put("method", label.method() == null ? null : label.method().name());
                    report.put(
                            "setDate", label.setDate() == null ? null : label.setDate().toString());
                    report.put("contentBits", label.contentBits());
                    report.put("protected", label.isProtected());
                });
        ArrayNode others = report.putArray("otherTenantLabels");
        labels.stream()
                .filter(label -> !settings.tenantId().equalsIgnoreCase(label.siteId()))
                .forEach(
                        label -> {
                            ObjectNode node = others.addObject();
                            node.put("labelId", label.labelId());
                            node.put("siteId", label.siteId());
                        });
        return objectMapper.writeValueAsString(report);
    }

    private PurviewConnectionSettings settings(String connectionId) {
        Long id = ApiConnectionResolver.connectionId(connectionId);
        if (id == null) {
            throw new IllegalArgumentException("'connectionId' is required");
        }
        return PurviewConnectionSettings.from(
                connectionResolver.resolveConfig(id, IntegrationType.PURVIEW));
    }

    private static AssignmentMethod parseMethod(String method) {
        AssignmentMethod parsed = AssignmentMethod.parse(method);
        if (parsed == null) {
            throw new IllegalArgumentException(
                    "'method' must be STANDARD (applied automatically) or PRIVILEGED (chosen by a"
                            + " person); got "
                            + method);
        }
        return parsed;
    }

    private static String safeFileName(String originalFilename) {
        String name = Filenames.toSimpleFileName(originalFilename);
        return (name == null || name.isBlank()) ? "labelled.pdf" : name;
    }
}
