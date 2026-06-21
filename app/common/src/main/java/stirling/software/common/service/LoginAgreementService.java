package stirling.software.common.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;

/**
 * Resolves the login agreement / disclaimer text. The per-language markdown lives in
 * customFiles/disclaimer/&lt;locale&gt;.md and is read live (no restart needed), while the
 * enable/visibility flags come from the predefined legal.loginAgreement settings.
 */
@Service
@Slf4j
public class LoginAgreementService {

    // Locale codes only: rejects path separators and dots so the value can never escape the
    // disclaimer directory. Matches e.g. en, en-GB, fr-FR, zh-Hant, pt-BR.
    private static final Pattern LOCALE_PATTERN =
            Pattern.compile("^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$");

    private final ApplicationProperties applicationProperties;

    public LoginAgreementService(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    public boolean isEnabled() {
        return config().isEnabled();
    }

    public boolean isShowInAnonymousMode() {
        return config().isShowInAnonymousMode();
    }

    /**
     * Resolve the markdown to show for the requested language, falling back through the base
     * language, the configured default locale (and its base), then the configured fallbackText.
     * Returns an empty string when nothing is configured.
     */
    public String resolveContent(String requestedLang) {
        List<String> candidates = new ArrayList<>();
        addLocaleCandidates(candidates, requestedLang);
        addLocaleCandidates(candidates, applicationProperties.getSystem().getDefaultLocale());

        for (String candidate : candidates) {
            String content = readFileIfExists(candidate);
            if (content != null && !content.isBlank()) {
                return content;
            }
        }

        String fallback = config().getFallbackText();
        return fallback == null ? "" : fallback;
    }

    /**
     * Admin read of a single locale's raw file. Returns null for an invalid locale, "" if absent.
     */
    public String readRawForLocale(String locale) {
        if (!isValidLocale(locale)) {
            return null;
        }
        String content = readFileIfExists(locale);
        return content == null ? "" : content;
    }

    /** Admin write. Blank content deletes the file so it falls back cleanly. */
    public void writeForLocale(String locale, String content) throws IOException {
        Path file = resolveLocaleFile(locale);
        if (file == null) {
            throw new IllegalArgumentException("Invalid locale: " + locale);
        }
        if (content == null || content.isBlank()) {
            Files.deleteIfExists(file);
            return;
        }
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    /** Locales that currently have a markdown file, for the admin editor. */
    public Set<String> listLocalesWithContent() {
        Set<String> result = new TreeSet<>();
        Path dir = disclaimerDir();
        if (!Files.isDirectory(dir)) {
            return result;
        }
        try (Stream<Path> files = Files.list(dir)) {
            files.filter(Files::isRegularFile)
                    .map(path -> path.getFileName().toString())
                    .filter(name -> name.endsWith(".md"))
                    .map(name -> name.substring(0, name.length() - ".md".length()))
                    .filter(this::isValidLocale)
                    .forEach(result::add);
        } catch (IOException e) {
            log.warn("Failed listing login agreement files", e);
        }
        return result;
    }

    private ApplicationProperties.Legal.LoginAgreement config() {
        return applicationProperties.getLegal().getLoginAgreement();
    }

    private Path disclaimerDir() {
        return Path.of(InstallationPathConfig.getCustomFilesPath(), "disclaimer").normalize();
    }

    private void addLocaleCandidates(List<String> out, String locale) {
        if (!isValidLocale(locale)) {
            return;
        }
        if (!out.contains(locale)) {
            out.add(locale);
        }
        String base = locale.split("[_-]", 2)[0];
        if (!base.equals(locale) && !out.contains(base)) {
            out.add(base);
        }
    }

    private String readFileIfExists(String locale) {
        Path file = resolveLocaleFile(locale);
        if (file == null) {
            return null;
        }
        try {
            if (Files.isRegularFile(file)) {
                return Files.readString(file, StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            log.warn("Failed reading login agreement file for locale {}", locale, e);
        }
        return null;
    }

    private Path resolveLocaleFile(String locale) {
        if (!isValidLocale(locale)) {
            return null;
        }
        Path dir = disclaimerDir();
        Path file = dir.resolve(locale + ".md").normalize();
        // Defence in depth: the regex already blocks separators, but confirm containment.
        if (!file.startsWith(dir)) {
            return null;
        }
        return file;
    }

    private boolean isValidLocale(String locale) {
        return locale != null && LOCALE_PATTERN.matcher(locale).matches();
    }
}
