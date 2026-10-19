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

    public record AvailableLabel(
            String id, String name, String parentName, String color, int sensitivity) {}

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
        Path output = Files.createTempFile("stirling-mip-open-", ".pdf");
        try {
            Map<String, String> args = arguments(account, protectedPdf);
            args.put("output", output.toString());
            ProtectionInfo protection =
                    ProtectionInfo.fromHelper(helper.run("decrypt", args, tokensFor(account)));
            return new Opened(Files.readAllBytes(output), protection);
        } finally {
            Files.deleteIfExists(output);
        }
    }

    public byte[] protectLike(ConnectedAccount account, Path original, Path derived)
            throws IOException {
        requireAvailable();
        Path output = Files.createTempFile("stirling-mip-protect-", ".pdf");
        try {
            Map<String, String> args = arguments(account, derived);
            args.put("original", original.toString());
            args.put("output", output.toString());
            helper.run("protect", args, tokensFor(account));
            return Files.readAllBytes(output);
        } finally {
            Files.deleteIfExists(output);
        }
    }

    public List<AvailableLabel> labels(ConnectedAccount account) throws IOException {
        requireAvailable();
        Map<String, String> args = arguments(account, null);
        JsonNode result = helper.run("labels", args, tokensFor(account));
        List<AvailableLabel> labels = new ArrayList<>();
        JsonNode list = result.get("labels");
        if (list != null) {
            list.forEach(
                    label ->
                            labels.add(
                                    new AvailableLabel(
                                            MipHelper.text(label, "id"),
                                            MipHelper.text(label, "name"),
                                            emptyToNull(MipHelper.text(label, "parentName")),
                                            emptyToNull(MipHelper.text(label, "color")),
                                            label.path("sensitivity").asInt(0))));
        }
        return labels;
    }

    public byte[] applyLabel(ConnectedAccount account, Path pdf, String labelId)
            throws IOException {
        requireAvailable();
        Path output = Files.createTempFile("stirling-mip-label-", ".pdf");
        try {
            Map<String, String> args = arguments(account, pdf);
            args.put("label-id", labelId);
            args.put("output", output.toString());
            helper.run("apply", args, tokensFor(account));
            return Files.readAllBytes(output);
        } finally {
            Files.deleteIfExists(output);
        }
    }

    public byte[] protectForUsers(ConnectedAccount account, Path pdf, String grants)
            throws IOException {
        requireAvailable();
        Path output = Files.createTempFile("stirling-mip-adhoc-", ".pdf");
        try {
            Map<String, String> args = arguments(account, pdf);
            args.put("grants", grants);
            args.put("output", output.toString());
            helper.run("adhoc", args, tokensFor(account));
            return Files.readAllBytes(output);
        } finally {
            Files.deleteIfExists(output);
        }
    }

    private static String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
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
