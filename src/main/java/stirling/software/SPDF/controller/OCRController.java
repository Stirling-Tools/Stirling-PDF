package stirling.software.SPDF.controller;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.ModelAndView;

import stirling.software.SPDF.utils.ProcessExecutor;
//import com.spire.pdf.*;
@Controller
public class OCRController {

	private static final Logger logger = LoggerFactory.getLogger(OCRController.class);

	@GetMapping("/ocr-pdf")
	public ModelAndView ocrPdfPage() {
		ModelAndView modelAndView = new ModelAndView("ocr-pdf");
		modelAndView.addObject("languages", getAvailableTesseractLanguages());
		modelAndView.addObject("currentPage", "ocr-pdf");
		return modelAndView;
	}

	@PostMapping("/ocr-pdf")
	public ResponseEntity<byte[]> processPdfWithOCR(@RequestParam("fileInput") MultipartFile inputFile,
			@RequestParam("languages") List<String> selectedLanguages,
			@RequestParam(name = "sidecar", required = false) Boolean sidecar) throws IOException, InterruptedException {

		//--output-type pdfa
		if (selectedLanguages == null || selectedLanguages.size() < 1) {
			throw new IOException("Please select at least one language.");
	    }
		
		// Save the uploaded file to a temporary location
		Path tempInputFile = Files.createTempFile("input_", ".pdf");
		inputFile.transferTo(tempInputFile.toFile());

		// Prepare the output file path
		Path tempOutputFile = Files.createTempFile("output_", ".pdf");

		// Run OCR Command
	    String languageOption = String.join("+", selectedLanguages);
	    List<String> command = new ArrayList<>(Arrays.asList("ocrmypdf","--verbose", "2", "--language", languageOption,
	            tempInputFile.toString(), tempOutputFile.toString()));
	    String sidecarFile = tempOutputFile.toString().replace(".pdf", ".txt");
	    if (sidecar != null && sidecar) {
	        command.add("--sidecar");
	        command.add(sidecarFile);
	    }
	    int returnCode = ProcessExecutor.runCommandWithOutputHandling(command);

		// Read the OCR processed PDF file
		byte[] pdfBytes = Files.readAllBytes(tempOutputFile);

		// Clean up the temporary files
		Files.delete(tempInputFile);
		// Return the OCR processed PDF as a response
		String outputFilename = inputFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_OCR.pdf";

		HttpHeaders headers = new HttpHeaders();

	    if (sidecar != null && sidecar) {
	        // Create a zip file containing both the PDF and the text file
	        String outputZipFilename = inputFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_OCR.zip";
	        Path tempZipFile = Files.createTempFile("output_", ".zip");

	        try (ZipOutputStream zipOut = new ZipOutputStream(new FileOutputStream(tempZipFile.toFile()))) {
	            // Add PDF file to the zip
	            ZipEntry pdfEntry = new ZipEntry(outputFilename);
	            zipOut.putNextEntry(pdfEntry);
	            Files.copy(tempOutputFile, zipOut);
	            zipOut.closeEntry();

	            // Add text file to the zip
	            ZipEntry txtEntry = new ZipEntry(sidecarFile);
	            zipOut.putNextEntry(txtEntry);
	            Files.copy(Paths.get(sidecarFile), zipOut);
	            zipOut.closeEntry();
	        }

	        byte[] zipBytes = Files.readAllBytes(tempZipFile);

	        // Clean up the temporary zip file
	        Files.delete(tempZipFile);
	        Files.delete(tempOutputFile);
	        Files.delete(Paths.get(sidecarFile));
	        
	        // Return the zip file containing both the PDF and the text file
	        headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
	        headers.setContentDispositionFormData("attachment", outputZipFilename);
	        return ResponseEntity.ok().headers(headers).body(zipBytes);
	    } else {
	        // Return the OCR processed PDF as a response
	    	Files.delete(tempOutputFile);
	        headers.setContentType(MediaType.APPLICATION_PDF);
	        headers.setContentDispositionFormData("attachment", outputFilename);
	        return ResponseEntity.ok().headers(headers).body(pdfBytes);
	    }
	    
	}

	public List<String> getAvailableTesseractLanguages() {
	    String tessdataDir = "/usr/share/tesseract-ocr/4.00/tessdata";
	    File[] files = new File(tessdataDir).listFiles();
	    if (files == null) {
	        return Collections.emptyList();
	    }
	    return Arrays.stream(files)
	            .filter(file -> file.getName().endsWith(".traineddata"))
	            .map(file -> file.getName().replace(".traineddata", ""))
	            .filter(lang -> !lang.equalsIgnoreCase("osd"))
	            .collect(Collectors.toList());
	}

}
