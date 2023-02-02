package stirling.software.SPDF.controller;

import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.ListIterator;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
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
public class RotationController {

	private static final Logger logger = LoggerFactory.getLogger(RotationController.class);

	@GetMapping("/rotate-pdf")
	public String rotatePdfForm(Model model) {
		model.addAttribute("currentPage", "rotate-pdf");
		return "rotate-pdf";
	}

	@PostMapping("/rotate-pdf")
	public ResponseEntity<byte[]> rotatePDF(@RequestParam("fileInput") MultipartFile pdfFile,
			@RequestParam("angle") String angle) throws IOException {

		// Load the PDF document
		PDDocument document = PDDocument.load(pdfFile.getBytes());

		// Get the list of pages in the document
		PDPageTree pages = document.getPages();

		// Rotate all pages by the specified angle
		Iterator<PDPage> iterPage = pages.iterator();

		while (iterPage.hasNext()) {
			PDPage page = iterPage.next();
			page.setRotation(Integer.valueOf(angle));
		}

		return PdfUtils.pdfDocToWebResponse(document, pdfFile.getName() + "_rotated.pdf");

	}

}
