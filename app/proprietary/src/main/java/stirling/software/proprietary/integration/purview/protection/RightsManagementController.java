package stirling.software.proprietary.integration.purview.protection;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.connectedaccount.AccountReconnectRequiredException;
import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.ObjectMapper;

@Slf4j
@RestController
@RequestMapping("/api/v1/rights-management")
@RequiredArgsConstructor
@Tag(
        name = "Microsoft Purview protection",
        description = "Open and edit PDFs encrypted by Microsoft Purview sensitivity labels")
public class RightsManagementController {

    public static final String PROTECTION_HEADER = "X-Stirling-Protection";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final RightsManagementService service;
    private final ConnectedAccountService accounts;

    public record StatusResponse(
            boolean enabled, boolean available, List<AccountOption> accounts) {}

    public record AccountOption(long id, String email, String status) {}

    public record ErrorResponse(String code, String message, String owner) {}

    @GetMapping("/status")
    @Operation(summary = "Whether this server can open Purview protected PDFs for the caller")
    public StatusResponse status(@AuthenticationPrincipal User user) {
        requireUser(user);
        List<AccountOption> options =
                accounts.list(user).stream()
                        .filter(
                                account ->
                                        CloudProvider.MICROSOFT.id().equals(account.getProvider()))
                        .map(
                                account ->
                                        new AccountOption(
                                                account.getId(),
                                                account.getEmail(),
                                                account.getStatus()))
                        .toList();
        return new StatusResponse(service.enabled(), service.available(), options);
    }

    @PostMapping(value = "/inspect", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Read the label and the caller's rights on a Purview protected PDF")
    public ProtectionInfo inspect(
            @AuthenticationPrincipal User user,
            @RequestPart("fileInput") MultipartFile file,
            @RequestParam(required = false) Long accountId)
            throws IOException {
        ConnectedAccount account = account(user, accountId);
        Path input = protectedCopy(file);
        try {
            return service.inspect(account, input);
        } finally {
            Files.deleteIfExists(input);
        }
    }

    @PostMapping(value = "/open", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Decrypt a Purview protected PDF for viewing",
            description =
                    "Requires the VIEW right. The caller's rights are returned base64url JSON in"
                            + " the X-Stirling-Protection header.")
    public ResponseEntity<byte[]> open(
            @AuthenticationPrincipal User user,
            @RequestPart("fileInput") MultipartFile file,
            @RequestParam(required = false) Long accountId)
            throws IOException {
        ConnectedAccount account = account(user, accountId);
        Path input = protectedCopy(file);
        try {
            RightsManagementService.Opened opened = service.open(account, input);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .header(PROTECTION_HEADER, encode(opened.protection()))
                    .header(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, PROTECTION_HEADER)
                    .body(opened.pdf());
        } finally {
            Files.deleteIfExists(input);
        }
    }

    @PostMapping(value = "/protect", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary =
                    "Protect a PDF with the label and permissions of a Purview protected original",
            description = "Requires the EDIT right on the original.")
    public ResponseEntity<byte[]> protect(
            @AuthenticationPrincipal User user,
            @RequestPart("original") MultipartFile original,
            @RequestPart("fileInput") MultipartFile file,
            @RequestParam(required = false) Long accountId)
            throws IOException {
        ConnectedAccount account = account(user, accountId);
        Path originalCopy = protectedCopy(original);
        Path derived = Files.createTempFile("stirling-mip-derived-", ".pdf");
        try {
            file.transferTo(derived);
            byte[] protectedPdf = service.protectLike(account, originalCopy, derived);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .body(protectedPdf);
        } finally {
            Files.deleteIfExists(originalCopy);
            Files.deleteIfExists(derived);
        }
    }

    @ExceptionHandler(RightsManagementException.class)
    public ResponseEntity<ErrorResponse> rightsError(RightsManagementException e) {
        HttpStatus status =
                switch (e.getCode()) {
                    case RightsManagementException.NO_PERMISSIONS,
                            RightsManagementException.ACCESS_DENIED ->
                            HttpStatus.FORBIDDEN;
                    case RightsManagementException.SIGN_IN_REQUIRED -> HttpStatus.CONFLICT;
                    case RightsManagementException.NOT_PROTECTED, "bad_input", "not_supported" ->
                            HttpStatus.UNPROCESSABLE_CONTENT;
                    case RightsManagementException.UNAVAILABLE, "service_disabled" ->
                            HttpStatus.SERVICE_UNAVAILABLE;
                    case RightsManagementException.NETWORK -> HttpStatus.BAD_GATEWAY;
                    default -> HttpStatus.INTERNAL_SERVER_ERROR;
                };
        if (status == HttpStatus.INTERNAL_SERVER_ERROR) {
            log.warn("Purview protection failed: {} {}", e.getCode(), e.getMessage());
        }
        return ResponseEntity.status(status)
                .body(new ErrorResponse(e.getCode(), e.getMessage(), e.getOwner()));
    }

    @ExceptionHandler(AccountReconnectRequiredException.class)
    public ResponseEntity<ErrorResponse> reconnect(AccountReconnectRequiredException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(
                        new ErrorResponse(
                                RightsManagementException.SIGN_IN_REQUIRED, e.getMessage(), null));
    }

    private ConnectedAccount account(User user, Long accountId) {
        requireUser(user);
        List<ConnectedAccount> microsoft =
                accounts.list(user).stream()
                        .filter(
                                account ->
                                        CloudProvider.MICROSOFT.id().equals(account.getProvider()))
                        .toList();
        if (accountId != null) {
            return microsoft.stream()
                    .filter(account -> account.getId().equals(accountId))
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        }
        if (microsoft.size() == 1) {
            return microsoft.getFirst();
        }
        throw new RightsManagementException(
                RightsManagementException.SIGN_IN_REQUIRED,
                microsoft.isEmpty()
                        ? "Connect your Microsoft account to open Purview protected PDFs"
                        : "Choose which connected Microsoft account to open this PDF with");
    }

    private static Path protectedCopy(MultipartFile file) throws IOException {
        Path copy = Files.createTempFile("stirling-mip-in-", ".pdf");
        file.transferTo(copy);
        boolean isProtected;
        try (PDDocument document = Loader.loadPDF(copy.toFile())) {
            isProtected = ProtectedPdfDetector.isMicrosoftProtected(document);
        } catch (IOException e) {
            isProtected = false;
        }
        if (!isProtected) {
            Files.deleteIfExists(copy);
            throw new RightsManagementException(
                    RightsManagementException.NOT_PROTECTED,
                    "This PDF is not protected by Microsoft Purview");
        }
        return copy;
    }

    private static String encode(ProtectionInfo protection) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(
                        JSON.writeValueAsString(protection).getBytes(StandardCharsets.UTF_8));
    }

    private static void requireUser(User user) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
    }
}
