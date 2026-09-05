package stirling.software.saas.store;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.proprietary.policy.asset.PolicyAssetRefs;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.Source;

/**
 * Turns a policy into a store manifest and says what it changed on the way. The manifest is an
 * allow list, not a copy: only each step's operation and its non-secret scalar settings survive.
 * Everything that describes the publisher's environment is dropped and reported as an {@code info}
 * finding (sources, destinations, schedule, editor trigger), secrets are cleared and reported as
 * {@code warn} with a matching "required on install" entry, and anything that could not work or
 * should not leave the server blocks (integration steps, unknown tools, supporting files, private
 * addresses, filesystem paths, emails inside settings).
 *
 * <p>Key matching is token based rather than {@code SecretMasker}'s word-boundary regex because
 * pipeline settings are camelCase: {@code ownerPassword} has no word boundary before "Password".
 */
@Component
@ConditionalOnProperty(name = "stirling.store.enabled", havingValue = "true")
public class StoreManifestSanitizer {

    /**
     * The sanitised chain plus its report. {@code tools} is the operation list for the catalogue.
     */
    public record Result(
            List<StoreFinding> findings,
            StoreManifest manifest,
            List<String> tools,
            boolean needsSetup) {}

    static final Set<String> SENSITIVE_TOKENS =
            Set.of(
                    "password",
                    "passphrase",
                    "token",
                    "secret",
                    "secrets",
                    "authorization",
                    "auth",
                    "jwt",
                    "cred",
                    "credential",
                    "credentials",
                    "cert",
                    "certificate",
                    "pin",
                    "otp");
    static final Set<String> SENSITIVE_PAIRS =
            Set.of(
                    "api key",
                    "access key",
                    "secret key",
                    "private key",
                    "signing secret",
                    "client secret",
                    "shared secret",
                    "connection id",
                    "webhook id",
                    "account key",
                    "license key");

    private static final String INTEGRATION_PREFIX = "/api/v1/integration/";
    private static final Pattern KEY_TOKENS =
            Pattern.compile("(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\\-.\\s]+");
    static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");
    static final Pattern IPV4 = Pattern.compile("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b");
    static final Pattern IPV6 = Pattern.compile("(?i)\\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\\b");
    static final Pattern PRIVATE_HOST =
            Pattern.compile(
                    "(?i)(?<![A-Za-z0-9-])(localhost|[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:local|internal|lan|corp|home|intranet|localdomain))(?![A-Za-z0-9-])");
    static final Pattern URL_WITH_CREDENTIALS =
            Pattern.compile("(?i)[a-z][a-z0-9+.-]*://[^/\\s:@]+:[^/\\s@]+@");
    static final Pattern URL = Pattern.compile("(?i)\\bhttps?://[^\\s\"'<>]+");
    static final Pattern FILESYSTEM_PATH =
            Pattern.compile(
                    "(?i)^(?:[a-z]:\\\\|\\\\\\\\|/(?:home|srv|var|etc|mnt|opt|tmp|usr|root|data|users|volumes|media)(?:/|$))");

    public Result sanitize(
            Policy policy,
            PublishRequest details,
            Function<String, Optional<Source>> sources,
            List<ToolDiagnostic> chainDiagnostics) {
        List<StoreFinding> findings = new ArrayList<>();
        List<StoreManifest.RequiredOnInstall> required = new ArrayList<>();
        String suggestedTrigger = null;

        for (PipelineInput input : policy.inputs()) {
            Optional<Source> source = sources.apply(input.sourceId());
            findings.add(
                    StoreFinding.info(
                            "source-removed",
                            "Source left out: " + describe(source, input.sourceId()),
                            "Stays on this server. Installers choose their own.",
                            StoreFinding.Where.input()));
            if (input.trigger() != null) {
                String summary = triggerSummary(input.trigger());
                if (suggestedTrigger == null) {
                    suggestedTrigger = summary;
                }
                findings.add(
                        StoreFinding.info(
                                "schedule-removed",
                                "Schedule left out: runs " + summary,
                                "Published as a suggestion, not a setting.",
                                StoreFinding.Where.input()));
            }
        }
        for (String outputId : policy.outputIds()) {
            findings.add(
                    StoreFinding.info(
                            "destination-removed",
                            "Destination left out: " + describe(sources.apply(outputId), outputId),
                            "Stays on this server. Installers choose their own.",
                            StoreFinding.Where.output()));
        }
        if (policy.editor().allowed()) {
            findings.add(
                    StoreFinding.info(
                            "editor-trigger-removed",
                            "Editor trigger left out",
                            "Installers decide whether the copy runs on editor uploads or exports.",
                            StoreFinding.Where.input()));
        }
        required.add(StoreManifest.RequiredOnInstall.source());
        required.add(StoreManifest.RequiredOnInstall.destination());

        if (policy.steps().isEmpty()) {
            findings.add(
                    StoreFinding.block(
                            "no-steps",
                            "The pipeline has no steps",
                            "Add at least one tool before publishing.",
                            StoreFinding.Where.details()));
        }

        List<StoreManifest.Step> steps = new ArrayList<>();
        List<String> tools = new ArrayList<>();
        for (int i = 0; i < policy.steps().size(); i++) {
            PipelineStep step = policy.steps().get(i);
            String operation = step.operation() == null ? "" : step.operation();
            String label = label(operation);
            StoreFinding.Where where = StoreFinding.Where.step(i, operation);

            if (!operation.startsWith("/api/v1/")) {
                findings.add(
                        StoreFinding.block(
                                "unknown-operation",
                                "Step " + (i + 1) + " is not a Stirling tool",
                                "\"" + operation + "\" is not something the store can publish.",
                                where));
            } else if (operation.startsWith(INTEGRATION_PREFIX)) {
                findings.add(
                        StoreFinding.block(
                                "integration-step",
                                label + " calls another system",
                                "Steps that call other systems carry connection ids specific to this"
                                        + " server and are not allowed in the store yet. Remove the"
                                        + " step to publish.",
                                where));
            }
            for (ToolDiagnostic diagnostic : chainDiagnostics) {
                if (diagnostic.stepIndex() == i
                        && diagnostic.severity() == ToolDiagnostic.Severity.ERROR) {
                    findings.add(
                            StoreFinding.block(
                                    diagnostic.code(),
                                    label + " cannot run here",
                                    diagnostic.message(),
                                    where));
                }
            }
            for (Map.Entry<String, String> binding : step.fileParameters().entrySet()) {
                if (PolicyAssetRefs.isAssetRef(binding.getValue())) {
                    findings.add(
                            StoreFinding.block(
                                    "supporting-file",
                                    label + " uses a supporting file",
                                    "The file for \""
                                            + binding.getKey()
                                            + "\" is stored on this server. Supporting files are not"
                                            + " published yet. Use a text setting, or remove the"
                                            + " step.",
                                    where));
                } else {
                    findings.add(
                            StoreFinding.info(
                                    "file-binding-removed",
                                    label + ": file binding \"" + binding.getKey() + "\" left out",
                                    "Files supplied with a run are not part of the pipeline.",
                                    where));
                }
            }

            Map<String, Object> cleaned = new LinkedHashMap<>();
            List<String> cleared = new ArrayList<>();
            for (Map.Entry<String, Object> entry : step.parameters().entrySet()) {
                if (entry.getValue() == null) {
                    continue;
                }
                if (isSensitiveKey(entry.getKey())) {
                    cleared.add(entry.getKey());
                    required.add(
                            StoreManifest.RequiredOnInstall.parameter(i, entry.getKey(), "secret"));
                    continue;
                }
                scanValue(label, entry.getKey(), entry.getValue(), where, findings);
                cleaned.put(entry.getKey(), entry.getValue());
            }
            if (!cleared.isEmpty()) {
                findings.add(
                        StoreFinding.warn(
                                "secret-cleared",
                                label + ": " + String.join(", ", cleared) + " cleared",
                                "Installers set their own. The step shows Needs setting up until"
                                        + " they do.",
                                where));
            }
            steps.add(new StoreManifest.Step(operation, cleaned));
            tools.add(operation);
        }

        boolean needsSetup = required.stream().anyMatch(r -> "parameter".equals(r.kind()));
        StoreManifest manifest =
                new StoreManifest(
                        StoreManifest.SCHEMA_VERSION,
                        details.trimmedName(),
                        details.trimmedDescription(),
                        details.category(),
                        policy.icon(),
                        steps,
                        required,
                        suggestedTrigger,
                        null);
        return new Result(findings, manifest, tools, needsSetup);
    }

    /** Whether a settings key names a secret, judged on its camelCase or snake_case tokens. */
    static boolean isSensitiveKey(String key) {
        if (key == null || key.isBlank()) {
            return false;
        }
        List<String> tokens = new ArrayList<>();
        for (String token : KEY_TOKENS.split(key)) {
            if (!token.isBlank()) {
                tokens.add(token.toLowerCase(Locale.ROOT));
            }
        }
        for (String token : tokens) {
            if (SENSITIVE_TOKENS.contains(token)) {
                return true;
            }
        }
        for (int i = 0; i + 1 < tokens.size(); i++) {
            if (SENSITIVE_PAIRS.contains(tokens.get(i) + " " + tokens.get(i + 1))) {
                return true;
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private static void scanValue(
            String label,
            String field,
            Object value,
            StoreFinding.Where where,
            List<StoreFinding> findings) {
        if (value instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (entry.getValue() != null) {
                    scanValue(
                            label, field + "." + entry.getKey(), entry.getValue(), where, findings);
                }
            }
        } else if (value instanceof List<?> list) {
            for (Object item : list) {
                if (item != null) {
                    scanValue(label, field, item, where, findings);
                }
            }
        } else if (value instanceof String text) {
            scanText(label, field, text, where, findings);
        }
    }

    private static void scanText(
            String label,
            String field,
            String text,
            StoreFinding.Where where,
            List<StoreFinding> findings) {
        if (EMAIL.matcher(text).find()) {
            findings.add(
                    StoreFinding.block(
                            "email-in-settings",
                            label + ": \"" + field + "\" contains an email address",
                            "Remove the address before publishing.",
                            where));
            return;
        }
        if (URL_WITH_CREDENTIALS.matcher(text).find()) {
            findings.add(
                    StoreFinding.block(
                            "url-credentials",
                            label + ": \"" + field + "\" contains a link with credentials",
                            "Remove the username and password from the address.",
                            where));
            return;
        }
        if (isPrivateAddress(text)) {
            findings.add(
                    StoreFinding.block(
                            "private-address",
                            label + " points at a private address",
                            "\""
                                    + text
                                    + "\" cannot be reached from other systems. Use a connection,"
                                    + " or remove the step.",
                            where));
            return;
        }
        if (FILESYSTEM_PATH.matcher(text.trim()).find()) {
            findings.add(
                    StoreFinding.block(
                            "filesystem-path",
                            label + " names a path on this server",
                            "\"" + text + "\" will not exist on another server. Remove it.",
                            where));
            return;
        }
        if (URL.matcher(text).find()) {
            findings.add(
                    StoreFinding.warn(
                            "public-url",
                            label + ": \"" + field + "\" is kept",
                            "\"" + text + "\" is published as the default.",
                            where));
        }
    }

    static boolean isPrivateAddress(String text) {
        if (PRIVATE_HOST.matcher(text).find() || IPV6.matcher(text).find()) {
            return true;
        }
        var ipv4 = IPV4.matcher(text);
        while (ipv4.find()) {
            // Any literal IPv4 address in a pipeline setting is environment specific, private or
            // not:
            // the same pipeline installed elsewhere would still point at this network's machine.
            return true;
        }
        return false;
    }

    private static String describe(Optional<Source> source, String id) {
        return source.map(s -> s.name() + " (" + s.type() + ")").orElse(id);
    }

    private static String triggerSummary(TriggerConfig trigger) {
        return switch (trigger.type()) {
            case "schedule" -> "on a schedule";
            case "folder-watch" -> "when a file arrives";
            case "webhook" -> "when called over a webhook";
            default -> trigger.type();
        };
    }

    /** "/api/v1/misc/compress-pdf" reads as "Compress pdf" in a finding title. */
    static String label(String operation) {
        String last = operation.substring(operation.lastIndexOf('/') + 1).replace('-', ' ').trim();
        if (last.isEmpty()) {
            return "Step";
        }
        return Character.toUpperCase(last.charAt(0)) + last.substring(1);
    }
}
