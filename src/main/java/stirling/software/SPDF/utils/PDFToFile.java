package stirling.software.SPDF.utils;

import io.github.pixee.security.Filenames;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.IOUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

public class PDFToFile {
    public ResponseEntity<byte[]> processPdfToOfficeFormat(
            MultipartFile inputFile, String outputFormat, String libreOfficeFilter)
            throws IOException, InterruptedException {

        if (!"application/pdf".equals(inputFile.getContentType())) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        // Get the original PDF file name without the extension
        String originalPdfFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        String pdfBaseName = originalPdfFileName.substring(0, originalPdfFileName.lastIndexOf('.'));

        // Validate output format
        List<String> allowedFormats =
                Arrays.asList(
                        "doc",
                        "docx",
                        "odt",
                        "ppt",
                        "pptx",
                        "odp",
                        "rtf",
                        "html",
                        "xml",
                        "txt:Text");
        if (!allowedFormats.contains(outputFormat)) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        Path tempInputFile = null;
        Path tempOutputDir = null;
        byte[] fileBytes;
        String fileName = "temp.file";

        try {
            // Save the uploaded file to a temporary location
            tempInputFile = Files.createTempFile("input_", ".pdf");
            Files.copy(
                    inputFile.getInputStream(), tempInputFile, StandardCopyOption.REPLACE_EXISTING);

            // Prepare the output directory
            tempOutputDir = Files.createTempDirectory("output_");

            // Run the LibreOffice command
            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    "soffice",
                                    "--infilter=" + libreOfficeFilter,
                                    "--convert-to",
                                    outputFormat,
                                    "--outdir",
                                    tempOutputDir.toString(),
                                    tempInputFile.toString()));
            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                            .runCommandWithOutputHandling(command);

            // Get output files
            List<File> outputFiles = Arrays.asList(tempOutputDir.toFile().listFiles());

            if (outputFiles.size() == 1) {
                // Return single output file
                File outputFile = outputFiles.get(0);
                if ("txt:Text".equals(outputFormat)) {
                    outputFormat = "txt";
                }
                fileName = pdfBaseName + "." + outputFormat;
                fileBytes = FileUtils.readFileToByteArray(outputFile);
            } else {
                // Return output files in a ZIP archive
                fileName = pdfBaseName + "To" + outputFormat + ".zip";
                ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
                ZipOutputStream zipOutputStream = new ZipOutputStream(byteArrayOutputStream);

                for (File outputFile : outputFiles) {
                    ZipEntry entry = new ZipEntry(outputFile.getName());
                    zipOutputStream.putNextEntry(entry);
                    FileInputStream fis = new FileInputStream(outputFile);
                    IOUtils.copy(fis, zipOutputStream);
                    fis.close();
                    zipOutputStream.closeEntry();
                }

                zipOutputStream.close();
                fileBytes = byteArrayOutputStream.toByteArray();
            }

        } finally {
            // Clean up the temporary files
            if (tempInputFile != null) Files.delete(tempInputFile);
            if (tempOutputDir != null) FileUtils.deleteDirectory(tempOutputDir.toFile());
        }
        return WebResponseUtils.bytesToWebResponse(
                fileBytes, fileName, MediaType.APPLICATION_OCTET_STREAM);
    }
}
