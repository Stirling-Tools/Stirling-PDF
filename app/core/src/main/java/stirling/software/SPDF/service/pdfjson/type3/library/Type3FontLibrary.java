package stirling.software.SPDF.service.pdfjson.type3.library;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.pdfjson.type3.Type3FontSignatureCalculator;

@Slf4j
@Component
@RequiredArgsConstructor
public class Type3FontLibrary {

    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;

    @Value("${stirling.pdf.json.type3.library.index:classpath:/type3/library/index.json}")
    private String indexLocation;

    private final Map<String, Type3FontLibraryEntry> signatureIndex = new ConcurrentHashMap<>();
    private final Map<String, Type3FontLibraryEntry> aliasIndex = new ConcurrentHashMap<>();
    private List<Type3FontLibraryEntry> entries = List.of();

    @jakarta.annotation.PostConstruct
    void initialise() {
        Resource resource = resourceLoader.getResource(indexLocation);
        if (!resource.exists()) {
            log.info("[TYPE3] Library index {} not found; Type3 library disabled", indexLocation);
            entries = List.of();
            return;
        }
        try (InputStream inputStream = resource.getInputStream()) {
            List<RawEntry> rawEntries =
                    objectMapper.readValue(inputStream, new TypeReference<List<RawEntry>>() {});
            List<Type3FontLibraryEntry> loaded = new ArrayList<>();
            for (RawEntry rawEntry : rawEntries) {
                Type3FontLibraryEntry entry = toEntry(rawEntry);
                if (entry != null && entry.hasAnyPayload()) {
                    loaded.add(entry);
                }
            }
            entries = Collections.unmodifiableList(loaded);
            signatureIndex.clear();
            aliasIndex.clear();

            for (Type3FontLibraryEntry entry : entries) {
                if (entry.getSignatures() != null) {
                    for (String signature : entry.getSignatures()) {
                        if (signature == null) {
                            continue;
                        }
                        String key = signature.toLowerCase(Locale.ROOT);
                        signatureIndex.putIfAbsent(key, entry);
                    }
                }
                if (entry.getAliases() != null) {
                    for (String alias : entry.getAliases()) {
                        String normalized = normalizeAlias(alias);
                        if (normalized != null) {
                            aliasIndex.putIfAbsent(normalized, entry);
                        }
                    }
                }
            }
            log.info(
                    "[TYPE3] Loaded {} Type3 library entries (signatures={}, aliases={}) from {}",
                    entries.size(),
                    signatureIndex.size(),
                    aliasIndex.size(),
                    indexLocation);
        } catch (IOException ex) {
            log.warn(
                    "[TYPE3] Failed to load Type3 library index {}: {}",
                    indexLocation,
                    ex.getMessage(),
                    ex);
            entries = List.of();
            signatureIndex.clear();
            aliasIndex.clear();
        }
    }

    public boolean isLoaded() {
        return !entries.isEmpty();
    }

    public Type3FontLibraryMatch match(PDType3Font font, String fontUid) throws IOException {
        if (font == null || entries.isEmpty()) {
            return null;
        }
        String signature = Type3FontSignatureCalculator.computeSignature(font);
        if (signature != null) {
            Type3FontLibraryEntry entry = signatureIndex.get(signature.toLowerCase(Locale.ROOT));
            if (entry != null) {
                log.debug(
                        "[TYPE3] Matched Type3 font {} to library entry {} via signature {}",
                        fontUid,
                        entry.getId(),
                        signature);
                return Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("signature")
                        .signature(signature)
                        .build();
            }
            log.debug(
                    "[TYPE3] No library entry for signature {} (font {})",
                    signature,
                    fontUid != null ? fontUid : font.getName());
        }

        String aliasKey = normalizeAlias(resolveBaseFontName(font));
        if (aliasKey != null) {
            Type3FontLibraryEntry entry = aliasIndex.get(aliasKey);
            if (entry != null) {
                log.debug(
                        "[TYPE3] Matched Type3 font {} to library entry {} via alias {}",
                        fontUid,
                        entry.getId(),
                        aliasKey);
                return Type3FontLibraryMatch.builder()
                        .entry(entry)
                        .matchType("alias:" + aliasKey)
                        .signature(signature)
                        .build();
            }
        }

        if (signature != null) {
            log.debug(
                    "[TYPE3] Library had no alias match for signature {} (font {})",
                    signature,
                    fontUid != null ? fontUid : font.getName());
        }
        return null;
    }

    private Type3FontLibraryEntry toEntry(RawEntry rawEntry) {
        if (rawEntry == null || rawEntry.id == null) {
            return null;
        }
        try {
            Type3FontLibraryEntry.Type3FontLibraryEntryBuilder builder =
                    Type3FontLibraryEntry.builder()
                            .id(rawEntry.id)
                            .label(rawEntry.label != null ? rawEntry.label : rawEntry.id)
                            .signatures(normalizeList(rawEntry.signatures))
                            .aliases(normalizeList(rawEntry.aliases))
                            .program(loadPayload(rawEntry.program))
                            .webProgram(loadPayload(rawEntry.webProgram))
                            .pdfProgram(loadPayload(rawEntry.pdfProgram))
                            .source(rawEntry.source);
            if (rawEntry.glyphCoverage != null && !rawEntry.glyphCoverage.isEmpty()) {
                for (Integer codePoint : rawEntry.glyphCoverage) {
                    if (codePoint != null) {
                        builder.glyphCode(codePoint);
                    }
                }
            }
            return builder.build();
        } catch (IOException ex) {
            log.warn(
                    "[TYPE3] Failed to load Type3 library entry {}: {}",
                    rawEntry.id,
                    ex.getMessage());
            return null;
        }
    }

    private Type3FontLibraryPayload loadPayload(RawPayload payload) throws IOException {
        if (payload == null) {
            return null;
        }
        byte[] data = null;
        if (payload.base64 != null && !payload.base64.isBlank()) {
            try {
                data = Base64.getDecoder().decode(payload.base64);
            } catch (IllegalArgumentException ex) {
                log.warn("[TYPE3] Invalid base64 payload in Type3 library: {}", ex.getMessage());
            }
        } else if (payload.resource != null && !payload.resource.isBlank()) {
            data = loadResourceBytes(payload.resource);
        }
        if (data == null || data.length == 0) {
            return null;
        }
        String base64 = Base64.getEncoder().encodeToString(data);
        return new Type3FontLibraryPayload(base64, normalizeFormat(payload.format));
    }

    private byte[] loadResourceBytes(String location) throws IOException {
        String resolved = resolveLocation(location);
        Resource resource = resourceLoader.getResource(resolved);
        if (!resource.exists()) {
            throw new IOException("Resource not found: " + resolved);
        }
        try (InputStream inputStream = resource.getInputStream()) {
            return inputStream.readAllBytes();
        }
    }

    private String resolveLocation(String location) {
        if (location == null || location.isBlank()) {
            return location;
        }
        if (location.contains(":")) {
            return location;
        }
        if (location.startsWith("/")) {
            return "classpath:" + location;
        }
        return "classpath:/" + location;
    }

    private List<String> normalizeList(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        return values.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }

    private String normalizeAlias(String alias) {
        if (alias == null) {
            return null;
        }
        String value = alias.trim();
        int plus = value.indexOf('+');
        if (plus >= 0 && plus < value.length() - 1) {
            value = value.substring(plus + 1);
        }
        return value.isEmpty() ? null : value.toLowerCase(Locale.ROOT);
    }

    private String normalizeFormat(String format) {
        if (format == null) {
            return null;
        }
        return format.trim().toLowerCase(Locale.ROOT);
    }

    private String resolveBaseFontName(PDType3Font font) {
        if (font == null) {
            return null;
        }
        String baseName = null;
        try {
            baseName = font.getName();
        } catch (Exception ignored) {
            // Some Type3 fonts throw when resolving names; fall back to COS dictionary.
        }
        if (baseName == null && font.getCOSObject() != null) {
            baseName = font.getCOSObject().getNameAsString(COSName.BASE_FONT);
        }
        return baseName;
    }

    private static final class RawEntry {
        public String id;
        public String label;
        public List<String> signatures;
        public List<String> aliases;
        public RawPayload program;
        public RawPayload webProgram;
        public RawPayload pdfProgram;
        public List<Integer> glyphCoverage;
        public String source;
    }

    private static final class RawPayload {
        public String resource;
        public String format;
        public String base64;
    }
}
