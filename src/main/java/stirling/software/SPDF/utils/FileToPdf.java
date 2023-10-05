package stirling.software.SPDF.utils;

import io.github.pixee.security.ZipSecurity;
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

import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

public class FileToPdf {
	 public static byte[] convertHtmlToPdf(byte[] fileBytes, String fileName) throws IOException, InterruptedException {
	    	
	    	Path tempOutputFile = Files.createTempFile("output_", ".pdf");
	        Path tempInputFile = null;
	        byte[] pdfBytes;
	        try {
		        if (fileName.endsWith(".html")) {
		            tempInputFile = Files.createTempFile("input_", ".html");
		            Files.write(tempInputFile, fileBytes);
		        } else {
		            tempInputFile = unzipAndGetMainHtml(fileBytes);
		        }
	
		        List<String> command = new ArrayList<>();
		        command.add("weasyprint");
		        command.add(tempInputFile.toString()); 
		        command.add(tempOutputFile.toString());
		        ProcessExecutorResult returnCode;
		        if (fileName.endsWith(".zip")) {	        	
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
		        
		        if (fileName.endsWith(".zip")) {
		        	GeneralUtils.deleteDirectory(tempInputFile.getParent());
		        }
	        }
	        
	        return pdfBytes;
	    }
	    

	    private static Path unzipAndGetMainHtml(byte[] fileBytes) throws IOException {
	        Path tempDirectory = Files.createTempDirectory("unzipped_");
	        try (ZipInputStream zipIn = ZipSecurity.createHardenedInputStream(new ByteArrayInputStream(fileBytes))) {
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
