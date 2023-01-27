package stirling.software.SPDF.controller;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.PdfUtils;

@Controller
public class FromPDFController {

	private static final Logger logger = LoggerFactory.getLogger(FromPDFController.class);

	@GetMapping("/convert-from-pdf")
	public String convertFromPdfForm() {
		return "convert-from-pdf";
	}

	@PostMapping("/convert-from-pdf")
	public byte[] convertToImage(@RequestParam("fileInput") MultipartFile file,
			@RequestParam("imageFormat") String imageFormat) throws IOException {
		byte[] pdfBytes = file.getBytes();
		return PdfUtils.convertFromPdf(pdfBytes, imageFormat);
	}

}
