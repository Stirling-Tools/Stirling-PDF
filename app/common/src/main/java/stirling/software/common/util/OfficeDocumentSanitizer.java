package stirling.software.common.util;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.SequenceInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import javax.xml.namespace.QName;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLOutputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import javax.xml.stream.XMLStreamWriter;

import org.apache.commons.io.output.CloseShieldOutputStream;
import org.springframework.stereotype.Component;

import io.github.pixee.security.ZipSecurity;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

// Strips external refs from OOXML/ODF uploads so LibreOffice can't be made to fetch them.
// Streams every part (XML with StAX), so a small upload that inflates hugely stays cheap.
@Component
@Slf4j
public class OfficeDocumentSanitizer {

    private static final Set<String> OOXML_EXTENSIONS =
            Set.of(
                    "docx", "docm", "dotx", "dotm", "xlsx", "xlsm", "xltx", "xltm", "pptx", "pptm",
                    "potx", "potm", "ppsx", "ppsm");

    private static final Set<String> ODF_EXTENSIONS =
            Set.of(
                    "odt", "ott", "ods", "ots", "odp", "otp", "odg", "otg", "odf", "odc", "odi",
                    "odm");

    private static final Set<String> ODF_XML_PARTS =
            Set.of("content.xml", "styles.xml", "meta.xml", "settings.xml");

    // Larger XML parts are checked from a temporary file rather than held in memory
    static final int IN_MEMORY_XML_BYTES = 1 << 20;

    private static final XMLInputFactory INPUT = inputFactory();

    private static final XMLOutputFactory OUTPUT = XMLOutputFactory.newDefaultFactory();

    private final SsrfProtectionService ssrfProtectionService;
    private final ApplicationProperties applicationProperties;

    public OfficeDocumentSanitizer(
            SsrfProtectionService ssrfProtectionService,
            ApplicationProperties applicationProperties) {
        this.ssrfProtectionService = ssrfProtectionService;
        this.applicationProperties = applicationProperties;
    }

    /** A part that declares a DOCTYPE, which no Office file has and LibreOffice would process. */
    public static class DoctypeRefused extends IllegalArgumentException {
        DoctypeRefused(String part) {
            super(
                    "The document has a DOCTYPE declaration in "
                            + part
                            + ", which Office documents never contain, so it was not converted");
        }
    }

    public boolean isSanitizableExtension(String extension) {
        if (extension == null) {
            return false;
        }
        String lower = extension.toLowerCase(Locale.ROOT);
        return OOXML_EXTENSIONS.contains(lower) || ODF_EXTENSIONS.contains(lower);
    }

    public byte[] sanitize(byte[] documentBytes, String extension) throws IOException {
        if (documentBytes == null || documentBytes.length == 0) {
            throw new IOException("Office document input is empty or null");
        }
        if (skip(extension)) {
            return documentBytes;
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream(documentBytes.length);
        sanitizeZip(new ByteArrayInputStream(documentBytes), out);
        return out.toByteArray();
    }

    /** Copies {@code in} to {@code out}, sanitized; {@code out} is left open. */
    public void sanitize(InputStream in, OutputStream out, String extension) throws IOException {
        byte[] first = in.readNBytes(1);
        if (first.length == 0) {
            throw new IOException("Office document input is empty or null");
        }
        InputStream all = new SequenceInputStream(new ByteArrayInputStream(first), in);
        if (skip(extension)) {
            all.transferTo(out);
            return;
        }
        sanitizeZip(all, out);
    }

    private boolean skip(String extension) {
        if (applicationProperties.getSystem().isDisableSanitize()) {
            log.debug("Office document sanitization disabled by configuration");
            return true;
        }
        return !isSanitizableExtension(extension);
    }

    private void sanitizeZip(InputStream in, OutputStream out) throws IOException {
        try (ZipInputStream zipIn = ZipSecurity.createHardenedInputStream(in);
                ZipOutputStream zipOut =
                        new ZipOutputStream(buffered(CloseShieldOutputStream.wrap(out)))) {
            ZipBombGuard.Budget budget = new ZipBombGuard.Budget();
            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                String name = entry.getName();
                ZipEntry outEntry = new ZipEntry(name);
                if (entry.getComment() != null) {
                    outEntry.setComment(entry.getComment());
                }
                if (entry.getExtra() != null) {
                    outEntry.setExtra(entry.getExtra());
                }
                zipOut.putNextEntry(outEntry);
                if (!entry.isDirectory()) {
                    InputStream data = budget.entryStream(zipIn);
                    Kind kind = kindOf(name);
                    if (kind == null) {
                        data.transferTo(zipOut);
                    } else {
                        sanitizeXml(name, kind, data, zipOut);
                    }
                }
                zipOut.closeEntry();
            }
        }
    }

    private enum Kind {
        RELS,
        ODF
    }

    private static Kind kindOf(String entryName) {
        String lower = entryName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".rels")) {
            return Kind.RELS;
        }
        int slash = lower.lastIndexOf('/');
        return ODF_XML_PARTS.contains(slash >= 0 ? lower.substring(slash + 1) : lower)
                ? Kind.ODF
                : null;
    }

    private void sanitizeXml(String name, Kind kind, InputStream data, OutputStream out)
            throws IOException {
        byte[] head = data.readNBytes(IN_MEMORY_XML_BYTES + 1);
        if (head.length <= IN_MEMORY_XML_BYTES) {
            if (!needsChanges(name, kind, new ByteArrayInputStream(head))) {
                out.write(head);
                return;
            }
            ByteArrayOutputStream cleaned = new ByteArrayOutputStream(head.length);
            if (strip(name, kind, new ByteArrayInputStream(head), cleaned)) {
                cleaned.writeTo(out);
            } else {
                out.write(head);
            }
            return;
        }
        Path spill = Files.createTempFile("office-sanitize-", ".xml");
        try {
            try (OutputStream file = buffered(Files.newOutputStream(spill))) {
                file.write(head);
                data.transferTo(file);
            }
            boolean changes;
            try (InputStream file = buffered(Files.newInputStream(spill))) {
                changes = needsChanges(name, kind, file);
            }
            if (changes) {
                Path cleaned = Files.createTempFile("office-sanitized-", ".xml");
                try {
                    boolean stripped;
                    try (InputStream file = buffered(Files.newInputStream(spill));
                            OutputStream to = buffered(Files.newOutputStream(cleaned))) {
                        stripped = strip(name, kind, file, to);
                    }
                    Files.copy(stripped ? cleaned : spill, out);
                } finally {
                    Files.deleteIfExists(cleaned);
                }
            } else {
                Files.copy(spill, out);
            }
        } finally {
            Files.deleteIfExists(spill);
        }
    }

    // A part that is not well-formed XML is left as it is, as LibreOffice cannot read it either
    private boolean needsChanges(String name, Kind kind, InputStream xml) throws IOException {
        XMLStreamReader reader = null;
        try {
            reader = INPUT.createXMLStreamReader(xml);
            while (reader.hasNext()) {
                int event = reader.next();
                if (event == XMLStreamConstants.DTD) {
                    throw new DoctypeRefused(name);
                }
                if (event == XMLStreamConstants.START_ELEMENT && strips(kind, reader)) {
                    return true;
                }
            }
            return false;
        } catch (XMLStreamException e) {
            log.warn(
                    "Failed to parse XML part '{}' for sanitization, leaving as-is: {}",
                    name,
                    e.getMessage());
            return false;
        } finally {
            close(reader);
        }
    }

    private boolean strips(Kind kind, XMLStreamReader reader) {
        if (kind == Kind.RELS) {
            return "Relationship".equals(reader.getLocalName())
                    && external(
                            reader.getAttributeValue(null, "TargetMode"),
                            reader.getAttributeValue(null, "Target"));
        }
        for (int i = 0; i < reader.getAttributeCount(); i++) {
            if (strippedHref(reader.getAttributeName(i), reader.getAttributeValue(i))) {
                return true;
            }
        }
        return false;
    }

    private boolean external(String targetMode, String target) {
        return "external".equalsIgnoreCase(targetMode)
                && !isAdminAllowed(target == null ? "" : target);
    }

    private boolean strippedHref(QName attribute, String value) {
        return "href".equalsIgnoreCase(attribute.getLocalPart())
                && isExternalUrl(value)
                && !isAdminAllowed(value);
    }

    // Writes the part without external relationships or hrefs; false if it cannot be read
    private boolean strip(String name, Kind kind, InputStream xml, OutputStream out)
            throws IOException {
        XMLStreamReader reader = null;
        XMLStreamWriter writer = null;
        try {
            reader = INPUT.createXMLStreamReader(xml);
            writer = OUTPUT.createXMLStreamWriter(out, "UTF-8");
            int skipping = 0;
            for (int event = reader.getEventType(); ; event = reader.next()) {
                if (skipping > 0) {
                    if (event == XMLStreamConstants.START_ELEMENT) {
                        skipping++;
                    } else if (event == XMLStreamConstants.END_ELEMENT) {
                        skipping--;
                    }
                } else if (event == XMLStreamConstants.START_ELEMENT
                        && kind == Kind.RELS
                        && droppedRelationship(reader)) {
                    skipping = 1;
                } else {
                    copy(name, kind, reader, writer, event);
                }
                if (event == XMLStreamConstants.END_DOCUMENT || !reader.hasNext()) {
                    break;
                }
            }
            writer.flush();
            return true;
        } catch (XMLStreamException e) {
            log.warn(
                    "Failed to rewrite XML part '{}' for sanitization, leaving as-is: {}",
                    name,
                    e.getMessage());
            return false;
        } finally {
            close(writer);
            close(reader);
        }
    }

    private void copy(
            String name, Kind kind, XMLStreamReader reader, XMLStreamWriter writer, int event)
            throws XMLStreamException {
        switch (event) {
            case XMLStreamConstants.START_DOCUMENT ->
                    writer.writeStartDocument(
                            "UTF-8", reader.getVersion() == null ? "1.0" : reader.getVersion());
            case XMLStreamConstants.START_ELEMENT -> startElement(kind, reader, writer);
            case XMLStreamConstants.END_ELEMENT -> writer.writeEndElement();
            case XMLStreamConstants.CHARACTERS, XMLStreamConstants.SPACE ->
                    writer.writeCharacters(
                            reader.getTextCharacters(),
                            reader.getTextStart(),
                            reader.getTextLength());
            case XMLStreamConstants.CDATA -> writer.writeCData(reader.getText());
            case XMLStreamConstants.COMMENT -> writer.writeComment(reader.getText());
            case XMLStreamConstants.PROCESSING_INSTRUCTION ->
                    writer.writeProcessingInstruction(
                            reader.getPITarget(),
                            reader.getPIData() == null ? "" : reader.getPIData());
            case XMLStreamConstants.ENTITY_REFERENCE ->
                    writer.writeEntityRef(reader.getLocalName());
            case XMLStreamConstants.DTD -> throw new DoctypeRefused(name);
            case XMLStreamConstants.END_DOCUMENT -> writer.writeEndDocument();
            default -> {
                // nothing else can appear in a part without a DTD
            }
        }
    }

    private void startElement(Kind kind, XMLStreamReader reader, XMLStreamWriter writer)
            throws XMLStreamException {
        writer.writeStartElement(
                prefix(reader.getPrefix()),
                reader.getLocalName(),
                reader.getNamespaceURI() == null ? "" : reader.getNamespaceURI());
        for (int i = 0; i < reader.getNamespaceCount(); i++) {
            String prefix = reader.getNamespacePrefix(i);
            String uri = reader.getNamespaceURI(i) == null ? "" : reader.getNamespaceURI(i);
            if (prefix == null || prefix.isEmpty()) {
                writer.writeDefaultNamespace(uri);
            } else {
                writer.writeNamespace(prefix, uri);
            }
        }
        for (int i = 0; i < reader.getAttributeCount(); i++) {
            QName attribute = reader.getAttributeName(i);
            String value = reader.getAttributeValue(i);
            if (kind == Kind.ODF && strippedHref(attribute, value)) {
                log.warn(
                        "Stripping ODF external href attribute ({}): {}",
                        attribute,
                        truncateForLog(value));
                continue;
            }
            writer.writeAttribute(
                    prefix(attribute.getPrefix()),
                    attribute.getNamespaceURI() == null ? "" : attribute.getNamespaceURI(),
                    attribute.getLocalPart(),
                    value);
        }
    }

    private static String prefix(String prefix) {
        return prefix == null ? "" : prefix;
    }

    private boolean droppedRelationship(XMLStreamReader reader) {
        if (!strips(Kind.RELS, reader)) {
            return false;
        }
        log.warn(
                "Stripping OOXML external relationship target: {}",
                truncateForLog(reader.getAttributeValue(null, "Target")));
        return true;
    }

    private boolean isExternalUrl(String url) {
        if (url == null) {
            return false;
        }
        String trimmed = url.trim().toLowerCase(Locale.ROOT);
        if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("../")) {
            return false;
        }
        return trimmed.startsWith("http://")
                || trimmed.startsWith("https://")
                || trimmed.startsWith("ftp://")
                || trimmed.startsWith("ftps://")
                || trimmed.startsWith("file:")
                || trimmed.startsWith("smb:")
                || trimmed.startsWith("\\\\")
                || trimmed.startsWith("//");
    }

    // Preserved only with an explicit allowedDomains entry; MEDIUM default would admit public URLs.
    private boolean isAdminAllowed(String url) {
        if (ssrfProtectionService == null || url == null || url.isBlank()) {
            return false;
        }
        ApplicationProperties.Html.UrlSecurity config =
                applicationProperties.getSystem().getHtml().getUrlSecurity();
        if (config == null
                || config.getAllowedDomains() == null
                || config.getAllowedDomains().isEmpty()) {
            return false;
        }
        return ssrfProtectionService.isUrlAllowed(url);
    }

    private static InputStream buffered(InputStream in) {
        return new BufferedInputStream(in, 1 << 16);
    }

    private static OutputStream buffered(OutputStream out) {
        return new BufferedOutputStream(out, 1 << 16);
    }

    private static XMLInputFactory inputFactory() {
        XMLInputFactory factory = XMLInputFactory.newDefaultFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        factory.setProperty(XMLInputFactory.IS_REPLACING_ENTITY_REFERENCES, false);
        factory.setXMLResolver(
                (publicId, systemId, baseUri, namespace) -> {
                    throw new XMLStreamException("External entities are not allowed");
                });
        return factory;
    }

    private static void close(XMLStreamReader reader) {
        if (reader != null) {
            try {
                reader.close();
            } catch (XMLStreamException ignored) {
                // nothing left to release
            }
        }
    }

    private static void close(XMLStreamWriter writer) {
        if (writer != null) {
            try {
                writer.close();
            } catch (XMLStreamException ignored) {
                // nothing left to release
            }
        }
    }

    private String truncateForLog(String value) {
        if (value == null) {
            return "null";
        }
        return value.length() > 80 ? value.substring(0, 80) + "..." : value;
    }
}
