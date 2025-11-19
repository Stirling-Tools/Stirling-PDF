package stirling.software.SPDF.service.PdfToJsonService;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import java.io.IOException;
import java.util.*;
import java.util.regex.*;
import java.util.stream.Collectors;

public class PDFProcessor {

    public static Tuple<String, String> getTag(String element) {
        Pattern pattern = Pattern.compile("<.*?>");
        if (element.contains("<") && element.contains(">")) {
            Matcher matcher = pattern.matcher(element);
            List<String> matches = new ArrayList<>();

            while (matcher.find()) {
                matches.add(matcher.group());
            }

            if (!matches.isEmpty()) {
                String tag = matches.get(0).replace("<", "").replace(">", "");
                String line = element.replaceAll("<.*?>", "");
                return new Tuple<>(tag, line);
            }
        }
        return new Tuple<>("", element);
    }

    public static Map<String, Object> fonts(PDDocument doc, boolean granularity) throws IOException {
        Map<String, FontStyle> styles = new HashMap<>();
        Map<String, Integer> fontCounts = new HashMap<>();

        PDFTextStripper stripper = new PDFTextStripper() {
            @Override
            protected void writeString(String text, List<TextPosition> textPositions) throws IOException {
                for (TextPosition position : textPositions) {
                    String fontName = position.getFont().getName();
                    float fontSize = position.getFontSizeInPt();

                    // Extract style information from font name
                    String fontNameLower = fontName.toLowerCase();
                    boolean isBold = fontNameLower.contains("bold") || fontNameLower.contains("black") || fontNameLower.contains("heavy");
                    boolean isItalic = fontNameLower.contains("italic") || fontNameLower.contains("oblique");

                    String identifier;
                    if (granularity) {
                        identifier = String.format("%.2f_%s_%s%s", fontSize, fontName,
                                isBold ? "bold" : "normal",
                                isItalic ? "italic" : "");
                        styles.put(identifier, new FontStyle(fontSize, fontName, isBold, isItalic));
                    } else {
                        identifier = String.format("%.2f", fontSize);
                        styles.put(identifier, new FontStyle(fontSize, fontName));
                    }

                    fontCounts.put(identifier, fontCounts.getOrDefault(identifier, 0) + 1);
                }
            }
        };

        stripper.getText(doc);

        if (fontCounts.isEmpty()) {
            throw new IllegalArgumentException("Zero discriminating fonts found!");
        }

        // Sort by count
        List<Map.Entry<String, Integer>> sortedCounts = fontCounts.entrySet()
                .stream()
                .sorted((e1, e2) -> e2.getValue().compareTo(e1.getValue()))
                .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("fontCounts", sortedCounts);
        result.put("styles", styles);
        return result;
    }

    public static Map<String, String> fontTags(List<Map.Entry<String, Integer>> fontCounts,
                                               Map<String, FontStyle> styles) {
        FontStyle pStyle = styles.get(fontCounts.get(0).getKey());
        float pSize = pStyle.size;

        List<Float> fontSizes = fontCounts.stream()
                .map(entry -> Float.parseFloat(entry.getKey().split("_")[0])) // Extract just the size part
                .distinct()
                .sorted(Comparator.reverseOrder())
                .collect(Collectors.toList());

        Map<String, String> sizeTag = new HashMap<>();
        int idx = 0;

        for (Float size : fontSizes) {
            idx++;
            if (Math.abs(size - pSize) < 0.01) {
                idx = 0;
                sizeTag.put(String.format("%.2f", size), "<p>");
            } else if (size > pSize) {
                sizeTag.put(String.format("%.2f", size), "<h" + idx + ">");
            } else {
                sizeTag.put(String.format("%.2f", size), "<s" + idx + ">");
            }
        }

        return sizeTag;
    }

    public static List<String> headersPara(PDDocument doc, Map<String, String> sizeTag) throws IOException {
        List<String> headerPara = new ArrayList<>();
        final boolean[] first = {true};
        final TextPosition[] previousS = {null};

        PDFTextStripper stripper = new PDFTextStripper() {
            @Override
            protected void writeString(String text, List<TextPosition> textPositions) throws IOException {
                StringBuilder blockString = new StringBuilder();

                for (TextPosition position : textPositions) {
                    String textContent = position.getUnicode();
                    if (textContent.trim().isEmpty()) continue;

                    String sizeKey = String.format("%.2f", position.getFontSizeInPt());
                    String currentTag = sizeTag.getOrDefault(sizeKey, "<p>");

                    if (first[0]) {
                        previousS[0] = position;
                        first[0] = false;
                        blockString.append(currentTag).append(textContent);
                    } else {
                        if (previousS[0] != null &&
                                Math.abs(position.getFontSizeInPt() - previousS[0].getFontSizeInPt()) < 0.01) {
                            if (blockString.length() == 0 ||
                                    blockString.chars().allMatch(c -> c == '|')) {
                                blockString.setLength(0);
                                blockString.append(currentTag).append(textContent);
                            } else {
                                blockString.append(" ").append(textContent);
                            }
                        } else {
                            if (blockString.length() > 0) {
                                headerPara.add(blockString.toString());
                            }
                            blockString.setLength(0);
                            blockString.append(currentTag).append(textContent);
                        }
                        previousS[0] = position;
                    }
                }

                if (blockString.length() > 0) {
                    String finalString = blockString.toString().replace("  ", " ");
                    headerPara.add(finalString);
                }
            }
        };

        stripper.getText(doc);
        return headerPara;
    }

    public static Tuple<List<Element>, List<Element>> makeNestedJson(
            List<String> elements, int maxHeader, String rootHeader, List<String> dropTags) {

        List<Element> elementList = new ArrayList<>();
        List<Element> jsonArrays = new ArrayList<>();
        List<String> elementsCopy = new ArrayList<>(elements);

        Element last = null;

        while (!elementsCopy.isEmpty()) {
            Element element = getNextToInclude(elementsCopy, maxHeader, rootHeader);
            if (element == null) break;

            if (!dropTags.isEmpty()) {
                element.dropTags(dropTags);
            }

            if (element.isRootTag || last == null) {
                jsonArrays.add(element);
                last = element;
                continue;
            }

            if (element.isParagraph()) {
                last.addNote(element.value, element.tag);
            } else {
                elementList.add(element);
                last.addHeaderElement(element);
                last = element;
            }
        }

        return new Tuple<>(jsonArrays, elementList);
    }

    private static Element getNextToInclude(List<String> elements, int maxHeader, String rootHeader) {
        if (elements.isEmpty()) return null;

        Element scan = new Element(elements.remove(0), maxHeader, rootHeader);
        while (scan.excludeTag() && !elements.isEmpty()) {
            String raw = elements.remove(0);
            scan = new Element(raw, maxHeader, rootHeader);
        }
        return scan;
    }

    public static void reverseNotes(List<Element> flat) {
        for (Element node : flat) {
            if (node.notes != null) {
                Collections.reverse(node.notes);
            }
        }
    }

    public static String serializeToJson(List<Element> elements) {
        List<Map<String, Object>> jsonList = new ArrayList<>();
        for (Element element : elements) {
            jsonList.add(elementToMap(element));
        }

        com.google.gson.Gson gson = new com.google.gson.GsonBuilder().setPrettyPrinting().create();
        return gson.toJson(jsonList);
    }

    private static Map<String, Object> elementToMap(Element element) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("value", element.value);
        map.put("tag", element.tag);

        // Convert children
        List<Map<String, Object>> children = new ArrayList<>();
        if (element.children != null) {
            for (Element child : element.children) {
                children.add(elementToMap(child));
            }
        }
        map.put("children", children);

        // Convert notes
        List<Map<String, String>> notes = new ArrayList<>();
        if (element.notes != null) {
            for (Note note : element.notes) {
                Map<String, String> noteMap = new LinkedHashMap<>();
                noteMap.put("tag", note.tag);
                noteMap.put("value", note.value);
                notes.add(noteMap);
            }
        }
        map.put("notes", notes);

        return map;
    }
}