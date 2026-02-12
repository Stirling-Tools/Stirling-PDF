package stirling.software.SPDF.controller.api.converters;

import java.util.List;
import java.util.Map;

import org.commonmark.Extension;
import org.commonmark.ext.gfm.tables.TableBlock;
import org.commonmark.ext.gfm.tables.TablesExtension;
import org.commonmark.node.Node;
import org.commonmark.parser.Parser;
import org.commonmark.renderer.html.AttributeProvider;
import org.commonmark.renderer.html.HtmlRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.*;

@ConvertApi
@RequiredArgsConstructor
public class ConvertMarkdownToPdf {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;

    private final TempFileManager tempFileManager;

    private final CustomHtmlSanitizer customHtmlSanitizer;

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/markdown/pdf")
    @StandardPdfResponse
    @Operation(
            summary = "Convert a Markdown file to PDF",
            description =
                    "This endpoint takes a Markdown file or ZIP (containing Markdown + images) input, converts it to HTML, and then to"
                            + " PDF format. Input:MARKDOWN Output:PDF Type:SISO")
    public ResponseEntity<byte[]> markdownToPdf(@ModelAttribute GeneralFile generalFile)
            throws Exception {
        MultipartFile fileInput = generalFile.getFileInput();

        if (fileInput == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "File must be in {0} format", "Markdown or ZIP");
        }

        String originalFilename = Filenames.toSimpleFileName(fileInput.getOriginalFilename());
        if (originalFilename == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "File must be in {0} format", ".md or .zip");
        }

        boolean isZip = originalFilename.toLowerCase().endsWith(".zip");
        boolean isMarkdown = originalFilename.toLowerCase().endsWith(".md");

        if (!isZip && !isMarkdown) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.fileFormatRequired", "File must be in {0} format", ".md or .zip");
        }

        byte[] pdfBytes;
        String outputFilename;

        if (isZip) {
            // Handle ZIP file containing markdown + images
            try (TempDirectory tempDir = new TempDirectory(tempFileManager)) {
                // Extract ZIP to temp directory
                java.nio.file.Path tempDirPath = tempDir.getPath();
                try (java.util.zip.ZipInputStream zipIn =
                        io.github.pixee.security.ZipSecurity.createHardenedInputStream(
                                new java.io.ByteArrayInputStream(fileInput.getBytes()))) {
                    java.util.zip.ZipEntry entry;
                    while ((entry = zipIn.getNextEntry()) != null) {
                        if (!entry.isDirectory()) {
                            java.nio.file.Path filePath = tempDirPath.resolve(entry.getName());
                            java.nio.file.Files.createDirectories(filePath.getParent());
                            java.nio.file.Files.copy(zipIn, filePath);
                        }
                        zipIn.closeEntry();
                    }
                }

                // Find the markdown file (look for .md files, prefer index.md or first one)
                java.io.File markdownFile = findMarkdownFile(tempDirPath.toFile());
                if (markdownFile == null) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.fileFormatRequired",
                            "ZIP must contain at least one {0} file",
                            ".md");
                }

                // Read and convert markdown to HTML
                String markdownContent = java.nio.file.Files.readString(markdownFile.toPath());
                List<Extension> extensions = List.of(TablesExtension.create());
                Parser parser = Parser.builder().extensions(extensions).build();
                Node document = parser.parse(markdownContent);
                HtmlRenderer renderer =
                        HtmlRenderer.builder()
                                .attributeProviderFactory(context -> new TableAttributeProvider())
                                .extensions(extensions)
                                .build();
                String htmlContent = renderer.render(document);

                // Create a new ZIP with HTML + images for WeasyPrint
                byte[] htmlZipBytes = createHtmlZip(htmlContent, tempDirPath.toFile());

                // Use FileToPdf which already supports ZIP files with images
                pdfBytes =
                        FileToPdf.convertHtmlToPdf(
                                runtimePathConfig.getWeasyPrintPath(),
                                null,
                                htmlZipBytes,
                                "package.zip",
                                tempFileManager,
                                customHtmlSanitizer);

                outputFilename =
                        GeneralUtils.generateFilename(
                                originalFilename.substring(0, originalFilename.lastIndexOf('.')),
                                ".pdf");
            }
        } else {
            // Handle plain markdown file (no images)
            List<Extension> extensions = List.of(TablesExtension.create());
            Parser parser = Parser.builder().extensions(extensions).build();

            Node document = parser.parse(new String(fileInput.getBytes()));
            HtmlRenderer renderer =
                    HtmlRenderer.builder()
                            .attributeProviderFactory(context -> new TableAttributeProvider())
                            .extensions(extensions)
                            .build();

            String htmlContent = renderer.render(document);

            pdfBytes =
                    FileToPdf.convertHtmlToPdf(
                            runtimePathConfig.getWeasyPrintPath(),
                            null,
                            htmlContent.getBytes(),
                            "converted.html",
                            tempFileManager,
                            customHtmlSanitizer);

            outputFilename = GeneralUtils.generateFilename(originalFilename, ".pdf");
        }

        pdfBytes = pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes);
        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
    }

    /**
     * Finds a markdown file in the directory. Prefers index.md, otherwise returns the first .md
     * file found.
     */
    private java.io.File findMarkdownFile(java.io.File directory) throws java.io.IOException {
        java.io.File indexMd = new java.io.File(directory, "index.md");
        if (indexMd.exists()) {
            return indexMd;
        }

        // Search for any .md file
        try (java.util.stream.Stream<java.nio.file.Path> paths =
                java.nio.file.Files.walk(directory.toPath())) {
            return paths.filter(p -> p.toString().toLowerCase().endsWith(".md"))
                    .findFirst()
                    .map(java.nio.file.Path::toFile)
                    .orElse(null);
        }
    }

    /**
     * Creates a ZIP file containing the HTML content and all other files (images) from the
     * directory.
     */
    private byte[] createHtmlZip(String htmlContent, java.io.File sourceDir)
            throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();

        try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(baos)) {
            // Add HTML file to root
            java.util.zip.ZipEntry htmlEntry = new java.util.zip.ZipEntry("index.html");
            zos.putNextEntry(htmlEntry);
            zos.write(htmlContent.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zos.closeEntry();

            // Add all other files (images, etc.)
            addDirectoryToZip(zos, sourceDir.toPath(), sourceDir.toPath());
        }

        return baos.toByteArray();
    }

    /** Recursively adds files from a directory to a ZIP, excluding .md files. */
    private void addDirectoryToZip(
            java.util.zip.ZipOutputStream zos,
            java.nio.file.Path sourceDir,
            java.nio.file.Path rootDir)
            throws java.io.IOException {
        try (java.util.stream.Stream<java.nio.file.Path> paths =
                java.nio.file.Files.walk(sourceDir, 1)) {
            for (java.nio.file.Path path : paths.toList()) {
                if (java.nio.file.Files.isDirectory(path)) {
                    if (!path.equals(sourceDir)) {
                        addDirectoryToZip(zos, path, rootDir);
                    }
                } else if (!path.toString().toLowerCase().endsWith(".md")) {
                    // Add file to ZIP, maintaining relative path structure
                    java.nio.file.Path relativePath = rootDir.relativize(path);
                    java.util.zip.ZipEntry entry =
                            new java.util.zip.ZipEntry(relativePath.toString());
                    zos.putNextEntry(entry);
                    java.nio.file.Files.copy(path, zos);
                    zos.closeEntry();
                }
            }
        }
    }
}

class TableAttributeProvider implements AttributeProvider {
    @Override
    public void setAttributes(Node node, String tagName, Map<String, String> attributes) {
        if (node instanceof TableBlock) {
            attributes.put("class", "table table-striped");
        }
    }
}
