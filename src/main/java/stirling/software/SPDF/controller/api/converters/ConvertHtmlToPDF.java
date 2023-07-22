package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertHtmlToPDF {


	 @PostMapping(consumes = "multipart/form-data", value = "/html-to-pdf")
	    @Operation(
	        summary = "Convert an HTML or ZIP (containing HTML and CSS) to PDF",
	        description = "This endpoint takes an HTML or ZIP file input and converts it to a PDF format."
	    )
	    public ResponseEntity<byte[]> HtmlToPdf(
	            @RequestPart(required = true, value = "fileInput") MultipartFile fileInput) throws IOException, InterruptedException {

	        if (fileInput == null) {
	            throw new IllegalArgumentException("Please provide an HTML or ZIP file for conversion.");
	        }

	        String originalFilename = fileInput.getOriginalFilename();
	        if (originalFilename == null || (!originalFilename.endsWith(".html") && !originalFilename.endsWith(".zip"))) {
	            throw new IllegalArgumentException("File must be either .html or .zip format.");
	        }
	        Path tempOutputFile = Files.createTempFile("output_", ".pdf");
	        Path tempInputFile = null;
	        byte[] pdfBytes;
	        try {
		        if (originalFilename.endsWith(".html")) {
		            tempInputFile = Files.createTempFile("input_", ".html");
		            Files.write(tempInputFile, fileInput.getBytes());
		        } else {
		            tempInputFile = unzipAndGetMainHtml(fileInput);
		        }
	
		        List<String> command = new ArrayList<>();
		        command.add("weasyprint");
		        command.add(tempInputFile.toString()); 
		        command.add(tempOutputFile.toString());
		        int returnCode = 0;
		        if (originalFilename.endsWith(".zip")) {	        	
		        	returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
	                .runCommandWithOutputHandling(command, tempInputFile.getParent().toFile());
		        } else {
	
		        	returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.WEASYPRINT)
		                                        .runCommandWithOutputHandling(command);
		        }
	
		        pdfBytes = Files.readAllBytes(tempOutputFile);
	        } finally {
		        // Clean up temporary files
		        Files.delete(tempOutputFile);
		        Files.delete(tempInputFile);
		        
		        if (originalFilename.endsWith(".zip")) {
		        	GeneralUtils.deleteDirectory(tempInputFile.getParent());
		        }
	        }
	        String outputFilename = originalFilename.replaceFirst("[.][^.]+$", "") + ".pdf";  // Remove file extension and append .pdf
	        return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
	    }



	    private Path unzipAndGetMainHtml(MultipartFile zipFile) throws IOException {
	        Path tempDirectory = Files.createTempDirectory("unzipped_");
	        try (ZipInputStream zipIn = new ZipInputStream(new ByteArrayInputStream(zipFile.getBytes()))) {
	            ZipEntry entry = zipIn.getNextEntry();
	            while (entry != null) {
	                Path filePath = tempDirectory.resolve(entry.getName());
	                if (entry.isDirectory()) {
	                    Files.createDirectories(filePath);  // Explicitly create the directory structure
	                } else {
	                    Files.createDirectories(filePath.getParent()); // Create parent directories if they don't exist
	                    Files.copy(zipIn, filePath);
	                }
	                zipIn.closeEntry();
	                entry = zipIn.getNextEntry();
	            }
	        }

	        //search for the main HTML file.
	        try (Stream<Path> walk = Files.walk(tempDirectory)) {
	            List<Path> htmlFiles = walk.filter(file -> file.toString().endsWith(".html"))
	                                       .collect(Collectors.toList());

	            if (htmlFiles.isEmpty()) {
	                throw new IOException("No HTML files found in the unzipped directory.");
	            }

	            // Prioritize 'index.html' if it exists, otherwise use the first .html file
	            for (Path htmlFile : htmlFiles) {
	                if (htmlFile.getFileName().toString().equals("index.html")) {
	                    return htmlFile;
	                }
	            }

	            return htmlFiles.get(0);
	        }
	    }

    
   


}
