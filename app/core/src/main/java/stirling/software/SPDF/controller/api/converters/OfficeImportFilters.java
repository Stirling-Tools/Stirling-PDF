package stirling.software.SPDF.controller.api.converters;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Maps extensions to filters and sanitizers; verify names to avoid silent autodetection. */
final class OfficeImportFilters {

    /**
     * Requires each filter to declare a sanitizer handled by the controller's exhaustive switch.
     */
    enum SanitizerKind {
        /** Passes bytes through; spreadsheet link formulas rely on LibreOffice's own fetch gate. */
        NONE,
        /** LibreOffice's HTML importer, which fetches what the markup references. */
        HTML,
        /**
         * Sanitizes Markdown images and embedded HTML, which LibreOffice resolves during import.
         */
        MARKDOWN,
        /** A ZIP package or a single XML document whose references can be walked and stripped. */
        OFFICE_XML,
        /** Sanitizes Word binary fields resolved by WW8; RTF and OOXML use a different importer. */
        WORD_BINARY
    }

    /** Matches staged bytes to a filter; ALWAYS selects without reading the file. */
    record Candidate(String importFilter, Declaration declares, SanitizerKind sanitizer) {}

    @FunctionalInterface
    interface Declaration {
        boolean matches(OfficeFormatDeclaration file);
    }

    private static final Declaration ALWAYS = file -> true;

    private static final Declaration WORD_97 = file -> wIdentIs(file, 0xA5EC);

    // Both values the pre-97 Word importer accepts; there is no Word 95 / WinWord 6.0 split, the
    // two filter names are the same filter.
    private static final Declaration WORD_95 =
            file -> wIdentIs(file, 0xA5DC) || wIdentIs(file, 0xA5DB);

    private static final Declaration WORD_2003_XML = msoDocument("Word.Document", "wordDocument");

    private static final Declaration EXCEL_2003_XML = msoDocument("Excel.Sheet", "Workbook");

    private static final Declaration EXCEL_BINARY =
            file ->
                    file.hasCompoundStream("Workbook")
                            || file.hasCompoundStream("Book")
                            || file.flatBiff();

    private static final Declaration POWERPOINT_BINARY =
            file -> file.hasCompoundStream("PowerPoint Document");

    private static final Declaration ZIP_PACKAGE = OfficeFormatDeclaration::zipContainer;

    /** Includes flat-ODF template, master and web variants accepted by the same importer. */
    private static final Declaration FLAT_ODF_TEXT =
            odfMimeType(
                    "application/vnd.oasis.opendocument.text",
                    "application/vnd.oasis.opendocument.text-template",
                    "application/vnd.oasis.opendocument.text-master",
                    "application/vnd.oasis.opendocument.text-master-template",
                    "application/vnd.oasis.opendocument.text-web");

    private static final Declaration FLAT_ODF_SPREADSHEET =
            odfMimeType(
                    "application/vnd.oasis.opendocument.spreadsheet",
                    "application/vnd.oasis.opendocument.spreadsheet-template");

    private static final Declaration FLAT_ODF_PRESENTATION =
            odfMimeType(
                    "application/vnd.oasis.opendocument.presentation",
                    "application/vnd.oasis.opendocument.presentation-template");

    private static final Declaration FLAT_ODF_GRAPHICS =
            odfMimeType(
                    "application/vnd.oasis.opendocument.graphics",
                    "application/vnd.oasis.opendocument.graphics-template");

    private static final Map<String, List<Candidate>> CANDIDATES = candidates();

    private OfficeImportFilters() {}

    static Map<String, List<Candidate>> candidateFilters() {
        return CANDIDATES;
    }

    /** The candidates for an extension, or an empty list when the endpoint does not accept it. */
    static List<Candidate> forExtension(String extensionLower) {
        return CANDIDATES.getOrDefault(extensionLower, List.of());
    }

    /** Returns the first match or null; force this filter and stage with the same extension. */
    static Candidate resolve(String extensionLower, Path staged) {
        List<Candidate> candidates = forExtension(extensionLower);
        if (candidates.size() == 1 && candidates.getFirst().declares() == ALWAYS) {
            return candidates.getFirst();
        }
        OfficeFormatDeclaration declaration = new OfficeFormatDeclaration(staged);
        for (Candidate candidate : candidates) {
            if (candidate.declares().matches(declaration)) {
                return candidate;
            }
        }
        return null;
    }

    private static boolean wIdentIs(OfficeFormatDeclaration file, int expected) {
        Integer wIdent = file.wordDocumentWIdent();
        return wIdent != null && wIdent == expected;
    }

    /**
     * Requires both the Office processing instruction and root element to avoid ambiguous matches.
     */
    private static Declaration msoDocument(String progId, String rootElement) {
        return file -> progId.equals(file.msoProgId()) && rootElement.equals(file.xmlRootElement());
    }

    private static Declaration odfMimeType(String... mimeTypes) {
        Set<String> accepted = Set.of(mimeTypes);
        return file -> {
            String declared = file.odfMimeType();
            return declared != null && accepted.contains(declared);
        };
    }

    private static Map<String, List<Candidate>> candidates() {
        Table table = new Table();

        table.one("docx", "MS Word 2007 XML", SanitizerKind.OFFICE_XML);
        table.one("docm", "MS Word 2007 XML VBA", SanitizerKind.OFFICE_XML);
        table.one("dotx", "MS Word 2007 XML Template", SanitizerKind.OFFICE_XML);
        table.one("dotm", "MS Word 2007 XML Template", SanitizerKind.OFFICE_XML);
        table.many(
                "doc",
                new Candidate("MS Word 97", WORD_97, SanitizerKind.WORD_BINARY),
                new Candidate("MS Word 95", WORD_95, SanitizerKind.WORD_BINARY),
                new Candidate("MS Word 2003 XML", WORD_2003_XML, SanitizerKind.OFFICE_XML));
        table.many(
                "dot",
                new Candidate("MS Word 97 Vorlage", WORD_97, SanitizerKind.WORD_BINARY),
                new Candidate("MS Word 95 Vorlage", WORD_95, SanitizerKind.WORD_BINARY));
        table.many(
                "odt",
                new Candidate("writer8", ZIP_PACKAGE, SanitizerKind.OFFICE_XML),
                new Candidate(
                        "OpenDocument Text Flat XML", FLAT_ODF_TEXT, SanitizerKind.OFFICE_XML));
        table.one("ott", "writer8_template", SanitizerKind.OFFICE_XML);
        table.one("odm", "writerglobal8", SanitizerKind.OFFICE_XML);
        table.one("oth", "writerweb8_writer_template", SanitizerKind.OFFICE_XML);
        table.one("fodt", "OpenDocument Text Flat XML", SanitizerKind.OFFICE_XML);
        table.many(
                "xml",
                new Candidate("MS Excel 2003 XML Orcus", EXCEL_2003_XML, SanitizerKind.OFFICE_XML),
                new Candidate("MS Word 2003 XML", WORD_2003_XML, SanitizerKind.OFFICE_XML),
                new Candidate(
                        "OpenDocument Text Flat XML", FLAT_ODF_TEXT, SanitizerKind.OFFICE_XML),
                new Candidate(
                        "OpenDocument Spreadsheet Flat XML",
                        FLAT_ODF_SPREADSHEET,
                        SanitizerKind.OFFICE_XML),
                new Candidate(
                        "OpenDocument Presentation Flat XML",
                        FLAT_ODF_PRESENTATION,
                        SanitizerKind.OFFICE_XML),
                new Candidate(
                        "OpenDocument Drawing Flat XML",
                        FLAT_ODF_GRAPHICS,
                        SanitizerKind.OFFICE_XML));
        table.one("rtf", "Rich Text Format", SanitizerKind.NONE);
        table.one("txt", "Text", SanitizerKind.NONE);
        table.one("md", "Markdown", SanitizerKind.MARKDOWN);
        table.one("xlsx", "Calc MS Excel 2007 XML", SanitizerKind.OFFICE_XML);
        table.one("xlsm", "Calc MS Excel 2007 VBA XML", SanitizerKind.OFFICE_XML);
        table.one("xltx", "Calc MS Excel 2007 XML Template", SanitizerKind.OFFICE_XML);
        table.one("xltm", "Calc MS Excel 2007 XML Template", SanitizerKind.OFFICE_XML);
        table.many(
                "xls",
                new Candidate("MS Excel 97", EXCEL_BINARY, SanitizerKind.NONE),
                new Candidate("MS Excel 2003 XML Orcus", EXCEL_2003_XML, SanitizerKind.OFFICE_XML));
        table.many(
                "xlt",
                new Candidate("MS Excel 97 Vorlage/Template", EXCEL_BINARY, SanitizerKind.NONE));
        table.many(
                "ods",
                new Candidate("calc8", ZIP_PACKAGE, SanitizerKind.OFFICE_XML),
                new Candidate(
                        "OpenDocument Spreadsheet Flat XML",
                        FLAT_ODF_SPREADSHEET,
                        SanitizerKind.OFFICE_XML));
        table.one("ots", "calc8_template", SanitizerKind.OFFICE_XML);
        table.one("fods", "OpenDocument Spreadsheet Flat XML", SanitizerKind.OFFICE_XML);
        table.one("csv", "Text - txt - csv (StarCalc)", SanitizerKind.NONE);
        table.one("slk", "SYLK", SanitizerKind.NONE);
        table.one("dif", "DIF", SanitizerKind.NONE);
        table.one("dbf", "dBase", SanitizerKind.NONE);
        table.one("json", "Orcus JSON", SanitizerKind.NONE);
        table.one("pptx", "Impress MS PowerPoint 2007 XML", SanitizerKind.OFFICE_XML);
        table.one("pptm", "Impress MS PowerPoint 2007 XML VBA", SanitizerKind.OFFICE_XML);
        table.one("potx", "Impress MS PowerPoint 2007 XML Template", SanitizerKind.OFFICE_XML);
        table.one("potm", "Impress MS PowerPoint 2007 XML Template", SanitizerKind.OFFICE_XML);
        table.one("ppsx", "Impress MS PowerPoint 2007 XML AutoPlay", SanitizerKind.OFFICE_XML);
        table.one("ppsm", "Impress MS PowerPoint 2007 XML VBA", SanitizerKind.OFFICE_XML);
        table.many("ppt", new Candidate("MS PowerPoint 97", POWERPOINT_BINARY, SanitizerKind.NONE));
        table.many(
                "odp",
                new Candidate("impress8", ZIP_PACKAGE, SanitizerKind.OFFICE_XML),
                new Candidate(
                        "OpenDocument Presentation Flat XML",
                        FLAT_ODF_PRESENTATION,
                        SanitizerKind.OFFICE_XML));
        table.one("otp", "impress8_template", SanitizerKind.OFFICE_XML);
        table.one("fodp", "OpenDocument Presentation Flat XML", SanitizerKind.OFFICE_XML);
        table.many(
                "odg",
                new Candidate("draw8", ZIP_PACKAGE, SanitizerKind.OFFICE_XML),
                new Candidate(
                        "OpenDocument Drawing Flat XML",
                        FLAT_ODF_GRAPHICS,
                        SanitizerKind.OFFICE_XML));
        table.one("otg", "draw8_template", SanitizerKind.OFFICE_XML);
        table.one("vsd", "Visio Document", SanitizerKind.NONE);
        table.one("lwp", "LotusWordPro", SanitizerKind.NONE);
        table.one("sdw", "StarOffice_Writer", SanitizerKind.NONE);
        table.one("sdc", "StarOffice_Spreadsheet", SanitizerKind.NONE);
        table.one("sdd", "StarOffice_Presentation", SanitizerKind.NONE);
        table.one("sda", "StarOffice_Drawing", SanitizerKind.NONE);
        table.one("sxw", "StarOffice XML (Writer)", SanitizerKind.OFFICE_XML);
        table.one("sxc", "StarOffice XML (Calc)", SanitizerKind.OFFICE_XML);
        table.one("sxi", "StarOffice XML (Impress)", SanitizerKind.OFFICE_XML);
        table.one("sxd", "StarOffice XML (Draw)", SanitizerKind.OFFICE_XML);
        table.one(
                "sxg",
                "writer_globaldocument_StarOffice_XML_Writer_GlobalDocument",
                SanitizerKind.OFFICE_XML);
        table.one("stw", "writer_StarOffice_XML_Writer_Template", SanitizerKind.OFFICE_XML);
        table.one("stc", "calc_StarOffice_XML_Calc_Template", SanitizerKind.OFFICE_XML);
        table.one("html", "HTML", SanitizerKind.HTML);
        table.one("htm", "HTML", SanitizerKind.HTML);
        table.one("svg", "SVG - Scalable Vector Graphics Draw", SanitizerKind.OFFICE_XML);
        table.one("eps", "EPS - Encapsulated PostScript", SanitizerKind.NONE);
        table.one("png", "PNG - Portable Network Graphic", SanitizerKind.NONE);
        table.one("jpg", "JPG - JPEG", SanitizerKind.NONE);
        table.one("jpeg", "JPG - JPEG", SanitizerKind.NONE);
        table.one("gif", "GIF - Graphics Interchange", SanitizerKind.NONE);
        table.one("bmp", "BMP - MS Windows", SanitizerKind.NONE);
        table.one("webp", "WEBP - WebP", SanitizerKind.NONE);
        table.one("tif", "TIF - Tag Image File", SanitizerKind.NONE);
        table.one("tiff", "TIF - Tag Image File", SanitizerKind.NONE);
        table.one("wmf", "WMF - MS Windows Metafile", SanitizerKind.NONE);
        table.one("svm", "SVM - StarView Metafile", SanitizerKind.NONE);
        table.one("pct", "PCT - Mac Pict", SanitizerKind.NONE);
        table.one("pbm", "PBM - Portable Bitmap", SanitizerKind.NONE);
        table.one("pgm", "PGM - Portable Graymap", SanitizerKind.NONE);
        table.one("ppm", "PPM - Portable Pixelmap", SanitizerKind.NONE);
        table.one("xbm", "XBM - X-Consortium", SanitizerKind.NONE);
        table.one("xpm", "XPM", SanitizerKind.NONE);
        table.one("ras", "RAS - Sun Rasterfile", SanitizerKind.NONE);

        return Map.copyOf(table.entries);
    }

    private static final class Table {
        private final Map<String, List<Candidate>> entries = new LinkedHashMap<>();

        void one(String extension, String importFilter, SanitizerKind sanitizer) {
            many(extension, new Candidate(importFilter, ALWAYS, sanitizer));
        }

        void many(String extension, Candidate... candidates) {
            entries.put(extension, List.of(candidates));
        }
    }
}
