package stirling.software.proprietary.integration.purview;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
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
@ApplicationScoped
@Path("/api/v1/integration")
@RequiredArgsConstructor
@Tag(name = "Integrations", description = "Third-party integration steps.")
public class PurviewLabelController {

    private final ApiConnectionResolver connectionResolver;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final ObjectMapper objectMapper;

    @POST
    @Path("/purview-apply-label")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Apply a Microsoft Purview sensitivity label",
            description =
                    "Writes the Purview label metadata (MSIP_Label_<GUID>_*) onto the PDF, so"
                            + " Purview-aware tools recognise the label. Applies the label only;"
                            + " it cannot encrypt, which requires the Microsoft client.")
    public Response applyLabel(
            @RestForm("fileInput") FileUpload fileInputUpload,
            @RestForm("connectionId") String connectionId,
            @RestForm("labelId") String labelId,
            @RestForm("labelName") String labelName,
            @RestForm("method") @DefaultValue("STANDARD") String method,
            @RestForm("contentBits") Integer contentBits)
            throws IOException {

        MultipartFile fileInput = FileUploadMultipartFile.of(fileInputUpload);
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

    @POST
    @Path("/purview-read-label")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Read the Microsoft Purview sensitivity label on a PDF",
            description =
                    "Reports the Purview labels a PDF already carries so a policy can act on"
                            + " them. The document passes through unchanged.")
    public Response readLabel(
            @RestForm("fileInput") FileUpload fileInputUpload,
            @RestForm("connectionId") String connectionId)
            throws IOException {

        MultipartFile fileInput = FileUploadMultipartFile.of(fileInputUpload);
        PurviewConnectionSettings settings = settings(connectionId);

        List<SensitivityLabel> labels;
        try (PDDocument document = pdfDocumentFactory.load(fileInput, true)) {
            labels = PdfSensitivityLabels.readAll(document);
        }
        // The document is returned byte-for-byte rather than re-saved: a read must not perturb the
        // file it inspected, and a PDFBox round-trip would rewrite its structure.
        byte[] bytes = fileInput.getBytes();
        return Response.ok(bytes)
                .type("application/pdf")
                .header(HttpHeaders.CONTENT_LENGTH, bytes.length)
                .header(
                        "Content-Disposition",
                        "form-data; name=\"attachment\"; filename=\""
                                + safeFileName(fileInput.getOriginalFilename())
                                + "\"")
                .header(AiToolResponseHeaders.TOOL_REPORT, buildReport(labels, settings))
                .build();
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
