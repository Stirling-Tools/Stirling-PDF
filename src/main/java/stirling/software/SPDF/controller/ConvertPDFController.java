package stirling.software.SPDF.controller;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class ConvertPDFController {

	private static final Logger logger = LoggerFactory.getLogger(ConvertPDFController.class);

	@GetMapping("/convert-pdf")
	public String convertToPdfForm(Model model) {
		model.addAttribute("currentPage", "convert-pdf");
		return "convert-pdf";
	}

	@PostMapping("/convert-to-pdf")
	public ResponseEntity<byte[]> convertToPdf(@RequestParam("fileInput") MultipartFile file) throws IOException {
		// Convert the file to PDF and get the resulting bytes
		byte[] bytes = PdfUtils.convertToPdf(file.getInputStream());
		logger.info("File {} successfully converted to pdf", file.getOriginalFilename());

		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.APPLICATION_PDF);
		String filename = "converted.pdf";
		headers.setContentDispositionFormData(filename, filename);
		headers.setCacheControl("must-revalidate, post-check=0, pre-check=0");
		ResponseEntity<byte[]> response = new ResponseEntity<>(bytes, headers, HttpStatus.OK);
		return response;
	}
	
	@PostMapping("/convert-from-pdf")
	public ResponseEntity<byte[]> convertToImage(@RequestParam("fileInput") MultipartFile file,
			@RequestParam("imageFormat") String imageFormat) throws IOException {
		byte[] pdfBytes = file.getBytes();
		//returns bytes for image
		byte[] result =  PdfUtils.convertFromPdf(pdfBytes, imageFormat.toLowerCase());
		HttpHeaders headers = new HttpHeaders();
		headers.setContentType(MediaType.parseMediaType(getMediaType(imageFormat)));
		headers.setCacheControl("must-revalidate, post-check=0, pre-check=0");
		ResponseEntity<byte[]> response = new ResponseEntity<>(result, headers, HttpStatus.OK);
		return response;
	}

	private String getMediaType(String imageFormat) {
	    if(imageFormat.equalsIgnoreCase("PNG"))
	        return "image/png";
	    else if(imageFormat.equalsIgnoreCase("JPEG") || imageFormat.equalsIgnoreCase("JPG"))
	        return "image/jpeg";
	    else if(imageFormat.equalsIgnoreCase("GIF"))
	        return "image/gif";
	    else
	        return "application/octet-stream";
	}
	
}
