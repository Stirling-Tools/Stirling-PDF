package stirling.software.SPDF.controller.api.form;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.annotation.JsonInclude;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.service.xfa.XfaEdit;
import stirling.software.SPDF.service.xfa.XfaInspection;
import stirling.software.SPDF.service.xfa.XfaMode;
import stirling.software.SPDF.service.xfa.XfaSyncReport;
import stirling.software.SPDF.service.xfa.XfaSyncService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;

import tools.jackson.databind.ObjectMapper;

@RestController
@RequestMapping("/api/v1/form")
@Tag(name = "Forms")
@RequiredArgsConstructor
public class XfaFormController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;
    private final XfaSyncService xfaSyncService;

    /** The sync report, plus the synced PDF unless the caller asked for the report alone. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record XfaSyncResponse(
            XfaMode mode,
            XfaInspection.State state,
            XfaSyncReport.Action action,
            boolean usageRightsRemoved,
            XfaSyncReport.Counts counts,
            List<XfaSyncReport.FieldResult> fields,
            List<String> warnings,
            @Schema(
                            description =
                                    "The updated PDF, base64 encoded; absent when includePdf is"
                                            + " false",
                            type = "string",
                            format = "byte")
                    byte[] pdf) {

        static XfaSyncResponse of(XfaSyncReport report, byte[] pdf) {
            return new XfaSyncResponse(
                    report.mode(),
                    report.state(),
                    report.action(),
                    report.usageRightsRemoved(),
                    report.counts(),
                    report.fields(),
                    report.warnings(),
                    pdf);
        }
    }

    @PostMapping(
            value = "/xfa-sync",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(
            summary = "Bring the XFA data of a hybrid form in line with its AcroForm fields",
            description =
                    "Takes a hybrid AcroForm + XFA PDF (as Adobe LiveCycle saves it) whose XFA"
                            + " data no longer matches its AcroForm fields, which makes Acrobat"
                            + " show different values from other viewers. Rewrites the XFA data"
                            + " from the AcroForm values (or removes the XFA with mode=strip),"
                            + " drops the Reader usage rights the save invalidates, and returns a"
                            + " report of every field with its XFA value before and after, plus"
                            + " the updated PDF as base64. Dynamic XFA forms, which have no"
                            + " AcroForm fields, are rejected: only Acrobat can fill them.")
    public ResponseEntity<XfaSyncResponse> syncXfa(
            @Parameter(
                            description = "The hybrid AcroForm + XFA PDF",
                            required = true,
                            content =
                                    @Content(
                                            mediaType = MediaType.APPLICATION_PDF_VALUE,
                                            schema = @Schema(type = "string", format = "binary")))
                    @RequestParam("file")
                    MultipartFile file,
            @Parameter(
                            description =
                                    "sync rewrites the XFA data from the AcroForm values; strip"
                                            + " removes the XFA packet so every viewer renders"
                                            + " the AcroForm fields",
                            schema =
                                    @Schema(
                                            type = "string",
                                            allowableValues = {"sync", "strip"},
                                            defaultValue = "sync"))
                    @RequestParam(value = "mode", required = false)
                    String mode,
            @Parameter(
                            description =
                                    "Include the updated PDF in the response. With false the"
                                            + " report shows what a sync would change and nothing"
                                            + " is written.")
                    @RequestParam(value = "includePdf", defaultValue = "true")
                    boolean includePdf,
            @Parameter(
                            description =
                                    "JSON array of fully qualified names of the fields the caller"
                                            + " edited. A sync only overwrites the stored value of"
                                            + " a numeric, date or picture-formatted field when it"
                                            + " was edited, and an edited field wins when fields"
                                            + " sharing one XFA value disagree.",
                            example = "[\"form1[0].Page1[0].Name[0]\"]")
                    @RequestPart(value = "changedFields", required = false)
                    byte[] changedFieldsPayload)
            throws IOException {

        XfaMode xfaMode = XfaMode.fromParam(mode);
        if (xfaMode == XfaMode.NONE) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidArgument", "{0}", "mode must be sync or strip");
        }
        if (file == null || file.isEmpty()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "{0} must be in PDF format", "file");
        }
        Set<String> changedFields = changedFields(changedFieldsPayload);

        try (PDDocument document =
                includePdf ? pdfDocumentFactory.load(file) : pdfDocumentFactory.load(file, true)) {
            XfaInspection before = xfaSyncService.inspect(document);
            if (!before.hasXfa()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.xfaNotPresent", "This PDF has no XFA form data to sync.");
            }
            xfaSyncService.requireSupported(before, xfaMode);
            XfaSyncReport report =
                    xfaSyncService.apply(document, before, xfaMode, XfaEdit.VALUES, changedFields);
            byte[] pdf = null;
            if (includePdf) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                document.save(out);
                pdf = out.toByteArray();
            }
            return ResponseEntity.ok(XfaSyncResponse.of(report, pdf));
        }
    }

    private Set<String> changedFields(byte[] payload) {
        if (payload == null || payload.length == 0) {
            return Set.of();
        }
        String json = new String(payload, StandardCharsets.UTF_8);
        return new LinkedHashSet<>(FormPayloadParser.parseNameList(objectMapper, json));
    }
}
