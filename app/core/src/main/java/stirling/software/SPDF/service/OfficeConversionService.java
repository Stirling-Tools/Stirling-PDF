package stirling.software.SPDF.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Enumeration;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.OfficeConvert;
import stirling.software.officeconvert.PdfToPptx;
import stirling.software.officeconvert.legacy.PdfToPpt;

/**
 * PDF to Office in process through Stirling Office Convert, and the switch between it and the
 * legacy converters. Conversions are stopped at the LibreOffice timeout.
 */
@Service
@RequiredArgsConstructor
public class OfficeConversionService {

    /** Output formats by extension; a .doc is RTF, which Word opens as a document. */
    private static final Map<String, OfficeConvert.Format> FORMATS =
            Map.of(
                    "docx", OfficeConvert.Format.DOCX,
                    "doc", OfficeConvert.Format.RTF,
                    "odt", OfficeConvert.Format.ODT,
                    "rtf", OfficeConvert.Format.RTF,
                    "txt", OfficeConvert.Format.TXT,
                    "pptx", OfficeConvert.Format.PPTX,
                    "odp", OfficeConvert.Format.ODP,
                    "xlsx", OfficeConvert.Format.XLSX,
                    "ods", OfficeConvert.Format.ODS);

    private final ApplicationProperties applicationProperties;
    private final EndpointConfiguration endpointConfiguration;

    public static boolean supports(String format) {
        return FORMATS.containsKey(format) || "ppt".equals(format);
    }

    /** Whether the admin chose the legacy converters (LibreOffice, Tabula, plain text). */
    public boolean legacy() {
        return !applicationProperties.getSystem().isStirlingOfficeConversion();
    }

    public boolean libreOfficeAvailable() {
        return endpointConfiguration.isGroupEnabled("LibreOffice");
    }

    /** Stirling Office Convert replaces LibreOffice only when the admin enables it. */
    public boolean replacesLibreOffice() {
        return !legacy();
    }

    public OfficeConvert.Settings settings() {
        long minutes =
                applicationProperties
                        .getProcessExecutor()
                        .getTimeoutMinutes()
                        .getLibreOfficeTimeoutMinutes();
        return OfficeConvert.Settings.defaults().timeout(Duration.ofMinutes(minutes));
    }

    /**
     * Writes {@code document} to {@code target} as {@code format}, one {@link #supports} accepts.
     */
    public void convert(
            PDDocument document, Path target, String format, OfficeConvert.Settings settings)
            throws IOException {
        if (!supports(format)) {
            throw new IllegalArgumentException("No PDF to Office conversion to " + format);
        }
        try (OutputStream out = Files.newOutputStream(target)) {
            if ("ppt".equals(format)) {
                // Binary PowerPoint comes from the legacy module, outside OfficeConvert's timeout.
                PdfToPpt.convert(document, out, slides(settings));
            } else {
                OfficeConvert.convert(document, out, FORMATS.get(format), settings);
            }
        }
    }

    /**
     * Whether a workbook holds any cell. With no table found, a sheet-per-table workbook is a
     * single empty sheet.
     */
    public static boolean hasCells(Path xlsx) throws IOException {
        try (ZipFile zip = new ZipFile(xlsx.toFile())) {
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                if (!entry.getName().startsWith("xl/worksheets/")) {
                    continue;
                }
                try (InputStream in = zip.getInputStream(entry)) {
                    // A sheet's first cell follows its short header, well within the first
                    // megabyte.
                    if (new String(in.readNBytes(1 << 20), StandardCharsets.ISO_8859_1)
                            .contains("<c ")) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private static PdfToPptx.Options slides(OfficeConvert.Settings s) {
        return new PdfToPptx.Options(
                s.firstPage(),
                s.lastPage(),
                s.tables(),
                s.figureDpi(),
                s.password(),
                s.pictureFallback(),
                s.pictures());
    }
}
