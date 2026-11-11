package stirling.software.proprietary.integration.purview.protection;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.connectedaccount.CloudProvider;
import stirling.software.proprietary.connectedaccount.ConnectedAccount;
import stirling.software.proprietary.connectedaccount.ConnectedAccountService;

import tools.jackson.databind.JsonNode;

@Service
@RequiredArgsConstructor
public class RightsManagementService {

    public record Opened(byte[] pdf, ProtectionInfo protection) {}

    private final MipHelper helper;
    private final ConnectedAccountService accounts;
    private final ApplicationProperties applicationProperties;

    public boolean enabled() {
        return microsoft().isEnabled() && microsoft().getRightsManagement().isEnabled();
    }

    public boolean available() {
        return enabled() && helper.available() && accounts.isAvailable(CloudProvider.MICROSOFT);
    }

    public ProtectionInfo inspect(ConnectedAccount account, Path protectedPdf) throws IOException {
        requireAvailable();
        JsonNode result =
                helper.run("inspect", arguments(account, protectedPdf), tokensFor(account));
        return ProtectionInfo.fromHelper(result);
    }

    public Opened open(ConnectedAccount account, Path protectedPdf) throws IOException {
        requireAvailable();
        HelperOutput output =
                runWritingPdf(
                        "decrypt", "stirling-mip-open-", account, arguments(account, protectedPdf));
        return new Opened(output.pdf(), ProtectionInfo.fromHelper(output.result()));
    }

    public byte[] protectLike(ConnectedAccount account, Path original, Path derived)
            throws IOException {
        requireAvailable();
        Map<String, String> args = arguments(account, derived);
        args.put("original", original.toString());
        return runWritingPdf("protect", "stirling-mip-protect-", account, args).pdf();
    }

    public List<ProtectionInfo.Label> labels(ConnectedAccount account) throws IOException {
        requireAvailable();
        JsonNode result = helper.run("labels", arguments(account, null), tokensFor(account));
        List<ProtectionInfo.Label> labels = new ArrayList<>();
        JsonNode list = result.get("labels");
        if (list != null) {
            list.forEach(label -> labels.add(ProtectionInfo.label(label)));
        }
        return labels;
    }

    public byte[] applyLabel(ConnectedAccount account, Path pdf, String labelId)
            throws IOException {
        requireAvailable();
        Map<String, String> args = arguments(account, pdf);
        args.put("label-id", labelId);
        return runWritingPdf("apply", "stirling-mip-label-", account, args).pdf();
    }

    public byte[] protectForUsers(ConnectedAccount account, Path pdf, String grants)
            throws IOException {
        requireAvailable();
        Map<String, String> args = arguments(account, pdf);
        args.put("grants", grants);
        return runWritingPdf("adhoc", "stirling-mip-adhoc-", account, args).pdf();
    }

    private record HelperOutput(JsonNode result, byte[] pdf) {}

    private HelperOutput runWritingPdf(
            String operation, String prefix, ConnectedAccount account, Map<String, String> args)
            throws IOException {
        Path output = Files.createTempFile(prefix, ".pdf");
        try {
            args.put("output", output.toString());
            JsonNode result = helper.run(operation, args, tokensFor(account));
            return new HelperOutput(result, Files.readAllBytes(output));
        } finally {
            Files.deleteIfExists(output);
        }
    }

    private Map<String, String> arguments(ConnectedAccount account, Path input) {
        if (account.getEmail() == null || account.getEmail().isBlank()) {
            throw new RightsManagementException(
                    RightsManagementException.SIGN_IN_REQUIRED,
                    "The connected Microsoft account has no sign-in name; connect it again");
        }
        Map<String, String> args = new LinkedHashMap<>();
        if (input != null) {
            args.put("input", input.toString());
        }
        args.put("user", account.getEmail());
        args.put("engine-id", "account-" + account.getId());
        args.put("client-id", microsoft().getClientId());
        args.put("app-name", "Stirling-PDF");
        args.put("app-version", applicationVersion());
        return args;
    }

    private MipHelper.TokenSource tokensFor(ConnectedAccount account) {
        return scope -> accounts.accessToken(account.getId(), List.of(scope));
    }

    private void requireAvailable() {
        if (!available()) {
            throw new RightsManagementException(
                    RightsManagementException.UNAVAILABLE,
                    "Opening Microsoft Purview protected PDFs is not set up on this server");
        }
    }

    private String applicationVersion() {
        String version = getClass().getPackage().getImplementationVersion();
        return version == null ? "0" : version.replace(';', '.');
    }

    private ApplicationProperties.Premium.ProFeatures.Microsoft microsoft() {
        return applicationProperties.getPremium().getProFeatures().getMicrosoft();
    }
}
