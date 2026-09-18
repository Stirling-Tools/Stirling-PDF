package stirling.software.SPDF.controller.api.converters;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The accepted upload extensions, each mapped to the ordered LibreOffice import filters it may be
 * read with and the sanitizer each of those needs.
 *
 * <p>This table is the security boundary of the office convert endpoint. An extension absent from
 * it never reaches LibreOffice. A present one is imported as one of the types named here rather
 * than as whatever LibreOffice's own content detection concludes: type confusion is the SSRF
 * vector, because bytes that merely look like markup are otherwise read with the Writer/Web
 * importer, which fetches what they reference whatever extension they arrived under.
 *
 * <p>Filter names are LibreOffice's own, from the {@code Filters} node of its type-detection
 * registry; {@code soffice --infilter=} and {@code unoconvert --input-filter} resolve exactly
 * these. A name neither can resolve is ignored silently and the conversion falls back to
 * autodetection with a zero exit, so a typo here turns the control off for that extension without
 * failing anything: check a new name against the installed registry, never against a green test.
 *
 * <p>Where an extension names several formats, the candidates are tried in order and the first
 * whose declaration the file satisfies is <em>forced</em>. The choice is confined to this table, so
 * an attacker who controls the declaration can only pick another filter they could already have
 * reached by renaming the file, and none of these lists holds a markup importer. Nothing falls back
 * to autodetection: an extension whose candidates all fail is refused.
 */
final class OfficeImportFilters {

    /**
     * The sanitizer a candidate needs before LibreOffice sees the file. Every candidate names one,
     * so a filter cannot be added without the question being answered, and {@link
     * ConvertOfficeController} switches over this enum without a default, so a new kind does not
     * compile until it is routed.
     */
    enum SanitizerKind {
        /**
         * Nothing to strip. Proven for these formats with a loopback listener: their importers
         * resolve no reference in the file, and for the spreadsheet text formats LibreOffice's own
         * link-formula gate is what stops {@code WEBSERVICE} and {@code DDE} dereferencing.
         */
        NONE,
        /** LibreOffice's HTML importer, which fetches what the markup references. */
        HTML,
        /**
         * LibreOffice's Markdown importer, which resolves markdown image syntax and the raw HTML
         * markdown embeds.
         */
        MARKDOWN,
        /** A ZIP package or a single XML document whose references can be walked and stripped. */
        OFFICE_XML,
        /**
         * A Word compound file, whose WW8 importer resolves {@code INCLUDEPICTURE} and the other
         * field instructions in its {@code WordDocument} stream. RTF and OOXML carry the same
         * fields through writerfilter, which does not resolve them.
         */
        WORD_BINARY
    }

    /**
     * One way an extension may be read. {@code declares} is asked of the staged file's own bytes;
     * {@code ALWAYS} is the single-candidate case, which decides without reading the file at all.
     */
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

    /**
     * The flavours of each flat-ODF media type, template and master and web included: one filter
     * reads them all, verified against LibreOffice for every value listed here, and a flavour left
     * out is a document the endpoint refuses that LibreOffice would have converted.
     */
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

    /**
     * The first candidate the staged file's own declaration satisfies, or null when it satisfies
     * none. The caller stages the file under {@code extensionLower} and forces the filter this
     * returns, so the filter and the extension LibreOffice sees cannot diverge.
     */
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
     * The {@code <?mso-application?>} declaration together with the root element it belongs to. The
     * processing instruction alone is not enough to choose between candidates: it sits in the
     * prolog, where a document declaring a different root can carry it as well, and the two
     * candidates would then be separated only by the order they happen to be listed in.
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
