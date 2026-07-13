package stirling.software.proprietary.service;

import java.util.List;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

import stirling.software.proprietary.model.api.ai.create.AiDocument;

@Component
public class AiDocumentHtmlRenderer {

    private static final Pattern SAFE_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private static final String BASE_STYLE =
            """
            <style>
              :root {
                --color-bg: #ffffff;
                --color-primary: #1e3a5f;
                --color-subtitle: #475569;
                --color-ref: #6b7280;
                --color-label: #374151;
                --color-body: #1a1a1a;
                --color-border-light: #e2e8f0;
                --color-border-heading: #cbd5e1;
                --font-body: "Helvetica Neue", Arial, sans-serif;
                --font-size-base: 10pt;
              }
              @page { size: A4; margin: 20mm; }
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body {
                font-family: var(--font-body);
                font-size: var(--font-size-base);
                line-height: 1.5;
                color: var(--color-body);
                background: var(--color-bg);
              }
              .doc-header {
                margin-bottom: 20pt;
                padding-bottom: 10pt;
                border-bottom: 2pt solid var(--color-primary);
              }
              .doc-title { font-size: 20pt; font-weight: 700; color: var(--color-primary); line-height: 1.2; }
              .doc-subtitle { font-size: 11pt; color: var(--color-subtitle); margin-top: 3pt; }
              .doc-reference { font-size: 9pt; color: var(--color-ref); margin-top: 4pt; }
              section { margin-bottom: 16pt; page-break-inside: avoid; break-inside: avoid; }
              section.line-items-section { page-break-inside: auto; break-inside: auto; }
              section h2 {
                font-size: 11pt;
                font-weight: 700;
                color: var(--color-primary);
                border-bottom: 0.5pt solid var(--color-border-heading);
                padding-bottom: 3pt;
                margin-bottom: 8pt;
              }
              .text-body p { margin-bottom: 6pt; }
              .text-body p:last-child { margin-bottom: 0; }
              .kv-table { width: 100%; border-collapse: collapse; }
              .kv-table td { padding: 3pt 0; vertical-align: top; }
              .kv-table td.kv-label { font-weight: 600; color: var(--color-label); width: 36%; padding-right: 10pt; }
              .kv-table td.kv-value { color: var(--color-body); }
              .line-items-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
              .line-items-table thead tr { background-color: var(--color-primary); color: #ffffff; }
              .line-items-table thead th { padding: 5pt 8pt; text-align: left; font-weight: 600; }
              .line-items-table thead th:not(:first-child) { text-align: right; }
              .line-items-table tbody td { padding: 4pt 8pt; border-bottom: 0.5pt solid var(--color-border-light); vertical-align: top; }
              .line-items-table tbody td:not(:first-child) { text-align: right; }
              .line-items-table tbody tr:last-child td { border-bottom: none; }
              .line-items-table tbody tr { page-break-inside: avoid; break-inside: avoid; }
              .line-items-table tr.total-row td { padding: 5pt 8pt; font-weight: 700; border-top: 1pt solid var(--color-primary); }
              .line-items-table tr.total-row td:not(:first-child) { text-align: right; }
              .bullet-list { padding-left: 14pt; }
              .bullet-list li { margin-bottom: 3pt; }
              .bullet-list li:last-child { margin-bottom: 0; }
              .signature-grid { width: 100%; margin-top: 8pt; }
              .signatory { display: inline-block; width: 44%; margin-right: 5%; margin-bottom: 8pt; vertical-align: top; }
              .sig-line { border-bottom: 1pt solid var(--color-label); height: 28pt; margin-bottom: 4pt; }
              .sig-name { font-size: 9pt; color: var(--color-label); }
            </style>
            """;

    public String render(AiDocument doc) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n");
        sb.append(BASE_STYLE);
        appendStyleOverride(sb, doc.getStyle());
        sb.append("</head>\n<body>\n");
        appendHeader(sb, doc);
        List<AiDocument.Section> sections = doc.getSections();
        if (sections != null) {
            for (AiDocument.Section section : sections) {
                appendSection(sb, section);
            }
        }
        sb.append("</body>\n</html>");
        return sb.toString();
    }

    private static void appendStyleOverride(StringBuilder sb, AiDocument.Style style) {
        if (style == null) {
            return;
        }
        String primary = safeColor(style.getPrimaryColor());
        String background = safeColor(style.getBackgroundColor());
        String body = safeColor(style.getBodyTextColor());
        if (primary == null && background == null && body == null) {
            return;
        }
        sb.append("<style>\n  :root {\n");
        if (primary != null) {
            sb.append("    --color-primary: ").append(primary).append(";\n");
        }
        if (background != null) {
            sb.append("    --color-bg: ").append(background).append(";\n");
        }
        if (body != null) {
            sb.append("    --color-body: ").append(body).append(";\n");
            sb.append("    --color-label: ").append(body).append(";\n");
        }
        sb.append("  }\n</style>\n");
    }

    private static void appendHeader(StringBuilder sb, AiDocument doc) {
        sb.append("<div class=\"doc-header\">\n");
        sb.append("  <div class=\"doc-title\">").append(esc(doc.getTitle())).append("</div>\n");
        if (notBlank(doc.getSubtitle())) {
            sb.append("  <div class=\"doc-subtitle\">")
                    .append(esc(doc.getSubtitle()))
                    .append("</div>\n");
        }
        if (notBlank(doc.getReferenceNumber())) {
            sb.append("  <div class=\"doc-reference\">")
                    .append(esc(doc.getReferenceNumber()))
                    .append("</div>\n");
        }
        sb.append("</div>\n");
    }

    private static void appendSection(StringBuilder sb, AiDocument.Section section) {
        if (section == null || section.getType() == null) {
            return;
        }
        switch (section.getType()) {
            case "text" -> appendText(sb, section);
            case "key_value" -> appendKeyValue(sb, section);
            case "line_items" -> appendLineItems(sb, section);
            case "bullet_list" -> appendBulletList(sb, section);
            case "signature" -> appendSignature(sb, section);
            default -> {}
        }
    }

    private static void appendText(StringBuilder sb, AiDocument.Section section) {
        sb.append("<section>\n");
        appendHeading(sb, section);
        sb.append("  <div class=\"text-body\">\n");
        String body = section.getBody() == null ? "" : section.getBody();
        for (String paragraph : body.split("\n\n")) {
            sb.append("    <p>").append(esc(paragraph.replace("\n", " "))).append("</p>\n");
        }
        sb.append("  </div>\n</section>\n");
    }

    private static void appendKeyValue(StringBuilder sb, AiDocument.Section section) {
        sb.append("<section>\n");
        appendHeading(sb, section);
        sb.append("  <table class=\"kv-table\">\n    <tbody>\n");
        if (section.getPairs() != null) {
            for (List<String> pair : section.getPairs()) {
                String label = pair.isEmpty() ? "" : pair.get(0);
                String value = pair.size() < 2 ? "" : pair.get(1);
                sb.append("      <tr>\n        <td class=\"kv-label\">")
                        .append(esc(label))
                        .append("</td>\n        <td class=\"kv-value\">")
                        .append(esc(value))
                        .append("</td>\n      </tr>\n");
            }
        }
        sb.append("    </tbody>\n  </table>\n</section>\n");
    }

    private static void appendLineItems(StringBuilder sb, AiDocument.Section section) {
        sb.append("<section class=\"line-items-section\">\n");
        appendHeading(sb, section);
        sb.append("  <table class=\"line-items-table\">\n    <thead>\n      <tr>\n");
        if (section.getColumns() != null) {
            for (String column : section.getColumns()) {
                sb.append("        <th>").append(esc(column)).append("</th>\n");
            }
        }
        sb.append("      </tr>\n    </thead>\n    <tbody>\n");
        if (section.getRows() != null) {
            for (List<String> row : section.getRows()) {
                sb.append("      <tr>\n");
                for (String cell : row) {
                    sb.append("        <td>").append(esc(cell)).append("</td>\n");
                }
                sb.append("      </tr>\n");
            }
        }
        if (section.getTotalRow() != null && !section.getTotalRow().isEmpty()) {
            sb.append("      <tr class=\"total-row\">\n");
            for (String cell : section.getTotalRow()) {
                sb.append("        <td>").append(esc(cell)).append("</td>\n");
            }
            sb.append("      </tr>\n");
        }
        sb.append("    </tbody>\n  </table>\n</section>\n");
    }

    private static void appendBulletList(StringBuilder sb, AiDocument.Section section) {
        sb.append("<section>\n");
        appendHeading(sb, section);
        sb.append("  <ul class=\"bullet-list\">\n");
        if (section.getItems() != null) {
            for (String item : section.getItems()) {
                sb.append("    <li>").append(esc(item)).append("</li>\n");
            }
        }
        sb.append("  </ul>\n</section>\n");
    }

    private static void appendSignature(StringBuilder sb, AiDocument.Section section) {
        sb.append("<section>\n");
        appendHeading(sb, section);
        sb.append("  <div class=\"signature-grid\">\n");
        if (section.getSignatories() != null) {
            for (String signatory : section.getSignatories()) {
                sb.append("    <div class=\"signatory\">\n      <div class=\"sig-line\"></div>\n")
                        .append("      <div class=\"sig-name\">")
                        .append(esc(signatory))
                        .append("</div>\n    </div>\n");
            }
        }
        sb.append("  </div>\n</section>\n");
    }

    private static void appendHeading(StringBuilder sb, AiDocument.Section section) {
        if (notBlank(section.getHeading())) {
            sb.append("  <h2>").append(esc(section.getHeading())).append("</h2>\n");
        }
    }

    private static String safeColor(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return SAFE_COLOR.matcher(trimmed).matches() ? trimmed : null;
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String esc(String value) {
        return value == null ? "" : HtmlUtils.htmlEscape(value);
    }
}
