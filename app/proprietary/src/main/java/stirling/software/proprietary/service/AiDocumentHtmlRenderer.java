package stirling.software.proprietary.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.hubspot.jinjava.Jinjava;
import com.hubspot.jinjava.JinjavaConfig;

import stirling.software.proprietary.model.api.ai.create.AiDocument;

/** Renders an {@link AiDocument} to HTML using a Jinja template loaded from the classpath. */
@Component
public class AiDocumentHtmlRenderer {

    private static final String TEMPLATE_PATH = "templates/ai/create/document.html.jinja2";

    private static final Pattern SAFE_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private final Jinjava jinjava;
    private final String template;

    public AiDocumentHtmlRenderer() {
        JinjavaConfig config =
                JinjavaConfig.newBuilder().withNestedInterpretationEnabled(false).build();
        this.jinjava = new Jinjava(config);
        this.template = loadTemplate();
    }

    public String render(AiDocument doc) {
        return jinjava.render(template, buildContext(doc));
    }

    private static Map<String, Object> buildContext(AiDocument doc) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("title", doc.getTitle());
        context.put("subtitle", doc.getSubtitle());
        context.put("reference_number", doc.getReferenceNumber());

        AiDocument.Style style = doc.getStyle();
        if (style != null) {
            context.put("style_primary", safeColor(style.getPrimaryColor()));
            context.put("style_background", safeColor(style.getBackgroundColor()));
            context.put("style_body", safeColor(style.getBodyTextColor()));
        }

        List<Map<String, Object>> sections = new ArrayList<>();
        if (doc.getSections() != null) {
            for (AiDocument.Section section : doc.getSections()) {
                if (section != null && section.getType() != null) {
                    sections.add(buildSection(section));
                }
            }
        }
        context.put("sections", sections);
        return context;
    }

    private static Map<String, Object> buildSection(AiDocument.Section section) {
        Map<String, Object> node = new LinkedHashMap<>();
        node.put("type", section.getType());
        node.put("heading", section.getHeading());
        switch (section.getType()) {
            case "text" -> node.put("paragraphs", paragraphs(section.getBody()));
            case "key_value" -> node.put("pairs", pairs(section.getPairs()));
            case "line_items" -> {
                node.put("columns", orEmpty(section.getColumns()));
                node.put("rows", orEmptyRows(section.getRows()));
                node.put("total_row", emptyToNull(section.getTotalRow()));
            }
            case "bullet_list" -> node.put("items", orEmpty(section.getItems()));
            case "signature" -> node.put("signatories", orEmpty(section.getSignatories()));
            default -> {}
        }
        return node;
    }

    private static List<String> paragraphs(String body) {
        String text = body == null ? "" : body;
        List<String> out = new ArrayList<>();
        for (String paragraph : text.split("\n\n")) {
            out.add(paragraph.replace("\n", " "));
        }
        return out;
    }

    private static List<Map<String, String>> pairs(List<List<String>> pairs) {
        List<Map<String, String>> out = new ArrayList<>();
        if (pairs != null) {
            for (List<String> pair : pairs) {
                Map<String, String> node = new LinkedHashMap<>();
                node.put("label", pair.isEmpty() ? "" : pair.get(0));
                node.put("value", pair.size() < 2 ? "" : pair.get(1));
                out.add(node);
            }
        }
        return out;
    }

    private static List<String> orEmpty(List<String> values) {
        return values == null ? List.of() : values;
    }

    private static List<List<String>> orEmptyRows(List<List<String>> rows) {
        return rows == null ? List.of() : rows;
    }

    private static List<String> emptyToNull(List<String> values) {
        return values == null || values.isEmpty() ? null : values;
    }

    private static String safeColor(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return SAFE_COLOR.matcher(trimmed).matches() ? trimmed : null;
    }

    private static String loadTemplate() {
        try {
            return new ClassPathResource(TEMPLATE_PATH).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
