package stirling.software.common.service;

import java.io.IOException;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSource;

@Component
@RequiredArgsConstructor
public class SignedPdfEditGuard {

    static final String REFUSAL =
            "This PDF is digitally signed, and changes to signed PDFs are turned off on this"
                    + " server. You can still view, print, convert or sign it again.";

    private static final Set<String> ADDS_SIGNATURE =
            Set.of("/api/v1/security/cert-sign", "/api/v1/security/timestamp-pdf");

    private final ApplicationProperties applicationProperties;
    private final ToolIOSource toolIO;

    public void check(PDDocument document) throws IOException {
        if (!applicationProperties.getSecurity().isBlockSignedPdfEdits()) {
            return;
        }
        String endpoint = currentEndpoint();
        if (endpoint == null || ADDS_SIGNATURE.contains(endpoint) || !writesPdf(endpoint)) {
            return;
        }
        if (!document.getSignatureDictionaries().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, REFUSAL);
        }
    }

    private boolean writesPdf(String endpoint) {
        return toolIO.find(endpoint)
                .map(spec -> spec.resolveOutput().format())
                .map(format -> format == ToolFormat.PDF || format == ToolFormat.PDF_ENCRYPTED)
                .orElse(false);
    }

    private static String currentEndpoint() {
        return ToolRequestEndpoint.current()
                .orElseGet(
                        () ->
                                RequestContextHolder.getRequestAttributes()
                                                instanceof ServletRequestAttributes attributes
                                        ? ToolRequestEndpoint.pathOf(attributes.getRequest())
                                        : null);
    }
}
