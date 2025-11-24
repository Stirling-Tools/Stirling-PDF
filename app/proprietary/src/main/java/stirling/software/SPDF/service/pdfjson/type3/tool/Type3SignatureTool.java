package stirling.software.SPDF.service.pdfjson.type3.tool;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectWriter;
import com.fasterxml.jackson.databind.SerializationFeature;

import stirling.software.SPDF.service.pdfjson.type3.Type3FontSignatureCalculator;
import stirling.software.SPDF.service.pdfjson.type3.Type3GlyphExtractor;
import stirling.software.SPDF.service.pdfjson.type3.model.Type3GlyphOutline;

/**
 * Small CLI helper that scans a PDF for Type3 fonts, computes their signatures, and optionally
 * emits JSON describing the glyph coverage. This allows Type3 library entries to be added without
 * digging through backend logs.
 *
 * <p>Usage:
 *
 * <pre>
 * ./gradlew :proprietary:type3SignatureTool --args="--pdf path/to/sample.pdf --output type3.json --pretty"
 * </pre>
 */
public final class Type3SignatureTool {

    private static final ObjectMapper OBJECT_MAPPER =
            new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    private Type3SignatureTool() {}

    public static void main(String[] args) throws Exception {
        Arguments arguments = Arguments.parse(args);
        if (arguments.showHelp || arguments.pdf == null) {
            printUsage();
            return;
        }

        Path pdfPath = arguments.pdf.toAbsolutePath();
        if (!Files.exists(pdfPath)) {
            throw new IOException("PDF not found: " + pdfPath);
        }

        List<Map<String, Object>> fonts;
        try (PDDocument document = Loader.loadPDF(pdfPath.toFile())) {
            fonts = collectType3Fonts(document);
        }

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("pdf", pdfPath.toString());
        output.put("fonts", fonts);
        ObjectWriter writer =
                arguments.pretty
                        ? OBJECT_MAPPER.writerWithDefaultPrettyPrinter()
                        : OBJECT_MAPPER.writer();
        if (arguments.output != null) {
            Path parent = arguments.output.toAbsolutePath().getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            writer.writeValue(arguments.output.toFile(), output);
            verifyOutput(arguments.output, fonts.size());
        } else {
            writer.writeValue(System.out, output);
        }
    }

    private static List<Map<String, Object>> collectType3Fonts(PDDocument document)
            throws IOException {
        if (document == null || document.getNumberOfPages() == 0) {
            return List.of();
        }
        List<Map<String, Object>> fonts = new ArrayList<>();
        Type3GlyphExtractor glyphExtractor = new Type3GlyphExtractor();
        Set<Object> visited = Collections.newSetFromMap(new IdentityHashMap<>());

        for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
            PDPage page = document.getPage(pageIndex);
            PDResources resources = page.getResources();
            if (resources == null) {
                continue;
            }
            scanResources(document, pageIndex + 1, resources, glyphExtractor, visited, fonts);
        }
        return fonts;
    }

    private static void scanResources(
            PDDocument document,
            int pageNumber,
            PDResources resources,
            Type3GlyphExtractor glyphExtractor,
            Set<Object> visited,
            List<Map<String, Object>> fonts)
            throws IOException {
        if (resources == null) {
            return;
        }

        for (COSName name : resources.getFontNames()) {
            PDFont font = resources.getFont(name);
            if (!(font instanceof PDType3Font type3Font)) {
                continue;
            }
            Object cosObject = type3Font.getCOSObject();
            if (cosObject != null && !visited.add(cosObject)) {
                continue;
            }
            fonts.add(
                    describeFont(document, pageNumber, name.getName(), type3Font, glyphExtractor));
        }

        Deque<PDResources> embedded = new ArrayDeque<>();
        for (COSName name : resources.getXObjectNames()) {
            PDXObject xobject = resources.getXObject(name);
            if (xobject instanceof PDFormXObject form && form.getResources() != null) {
                embedded.add(form.getResources());
            }
        }
        while (!embedded.isEmpty()) {
            scanResources(document, pageNumber, embedded.pop(), glyphExtractor, visited, fonts);
        }
    }

    private static Map<String, Object> describeFont(
            PDDocument document,
            int pageNumber,
            String fontId,
            PDType3Font font,
            Type3GlyphExtractor glyphExtractor)
            throws IOException {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("pageNumber", pageNumber);
        payload.put("fontId", fontId);
        payload.put("baseName", safeFontName(font));
        payload.put("alias", normalizeAlias(safeFontName(font)));
        payload.put("encoding", resolveEncoding(font));
        payload.put("signature", Type3FontSignatureCalculator.computeSignature(font));

        List<Type3GlyphOutline> glyphs =
                glyphExtractor.extractGlyphs(document, font, fontId, pageNumber);
        payload.put("glyphCount", glyphs != null ? glyphs.size() : 0);

        Set<Integer> coverage = new TreeSet<>();
        if (glyphs != null) {
            for (Type3GlyphOutline glyph : glyphs) {
                if (glyph == null) {
                    continue;
                }
                if (glyph.getUnicode() != null) {
                    coverage.add(glyph.getUnicode());
                } else if (glyph.getCharCode() >= 0) {
                    coverage.add(0xF000 | (glyph.getCharCode() & 0xFF));
                }
            }
            List<Map<String, Object>> warnings = new ArrayList<>();
            for (Type3GlyphOutline glyph : glyphs) {
                if (glyph != null && glyph.getWarnings() != null) {
                    Map<String, Object> warning = new LinkedHashMap<>();
                    warning.put("glyphName", glyph.getGlyphName());
                    warning.put("message", glyph.getWarnings());
                    warnings.add(warning);
                }
            }
            if (!warnings.isEmpty()) {
                payload.put("warnings", warnings);
            }
        }
        if (!coverage.isEmpty()) {
            payload.put("glyphCoverage", new ArrayList<>(coverage));
        }
        return payload;
    }

    private static void verifyOutput(Path output, int fontCount) throws IOException {
        Path absolute = output.toAbsolutePath();
        if (!Files.exists(absolute)) {
            throw new IOException("Expected output file not found: " + absolute);
        }
        long size = Files.size(absolute);
        if (size == 0) {
            throw new IOException("Output file is empty: " + absolute);
        }
        System.out.println(
                "Wrote " + fontCount + " fonts to " + absolute + " (" + size + " bytes, verified)");
    }

    private static String resolveEncoding(PDType3Font font) {
        if (font == null || font.getEncoding() == null) {
            return null;
        }
        Object encoding = font.getCOSObject().getDictionaryObject(COSName.ENCODING);
        return encoding != null
                ? encoding.toString()
                : font.getEncoding().getClass().getSimpleName();
    }

    private static String safeFontName(PDType3Font font) {
        if (font == null) {
            return null;
        }
        try {
            if (font.getName() != null) {
                return font.getName();
            }
        } catch (Exception ignored) {
            // ignore
        }
        if (font.getCOSObject() != null) {
            return font.getCOSObject().getNameAsString(COSName.BASE_FONT);
        }
        return null;
    }

    private static String normalizeAlias(String name) {
        if (name == null) {
            return null;
        }
        int plus = name.indexOf('+');
        String normalized = plus >= 0 ? name.substring(plus + 1) : name;
        normalized = normalized.trim();
        return normalized.isEmpty() ? null : normalized.toLowerCase(Locale.ROOT);
    }

    private static void printUsage() {
        System.out.println(
                """
                Type3SignatureTool - dump Type3 font signatures for library building
                Usage:
                  --pdf <file.pdf>          Input PDF to analyse (required)
                  --output <file.json>      Optional output file (defaults to stdout)
                  --pretty                  Pretty-print JSON output
                  --help                    Show this help

                Example:
                  ./gradlew :proprietary:type3SignatureTool --args="--pdf samples/foo.pdf --output foo.json --pretty"
                """);
    }

    private static final class Arguments {
        private final Path pdf;
        private final Path output;
        private final boolean pretty;
        private final boolean showHelp;

        private Arguments(Path pdf, Path output, boolean pretty, boolean showHelp) {
            this.pdf = pdf;
            this.output = output;
            this.pretty = pretty;
            this.showHelp = showHelp;
        }

        static Arguments parse(String[] args) {
            if (args == null || args.length == 0) {
                return new Arguments(null, null, true, true);
            }
            Path pdf = null;
            Path output = null;
            boolean pretty = false;
            boolean showHelp = false;
            for (int i = 0; i < args.length; i++) {
                String arg = args[i];
                if ("--pdf".equals(arg) && i + 1 < args.length) {
                    pdf = Paths.get(args[++i]);
                } else if ("--output".equals(arg) && i + 1 < args.length) {
                    output = Paths.get(args[++i]);
                } else if ("--pretty".equals(arg)) {
                    pretty = true;
                } else if ("--help".equals(arg) || "-h".equals(arg)) {
                    showHelp = true;
                }
            }
            return new Arguments(pdf, output, pretty, showHelp);
        }
    }
}
