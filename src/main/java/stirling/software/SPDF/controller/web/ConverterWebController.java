package stirling.software.SPDF.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.servlet.ModelAndView;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.utils.CheckProgramInstall;

@Controller
@Tag(name = "Convert", description = "Convert APIs")
public class ConverterWebController {

    @GetMapping("/img-to-pdf")
    @Hidden
    public String convertImgToPdfForm(Model model) {
        model.addAttribute("currentPage", "img-to-pdf");
        return "convert/img-to-pdf";
    }

    @GetMapping("/html-to-pdf")
    @Hidden
    public String convertHTMLToPdfForm(Model model) {
        model.addAttribute("currentPage", "html-to-pdf");
        return "convert/html-to-pdf";
    }

    @GetMapping("/markdown-to-pdf")
    @Hidden
    public String convertMarkdownToPdfForm(Model model) {
        model.addAttribute("currentPage", "markdown-to-pdf");
        return "convert/markdown-to-pdf";
    }

    @GetMapping("/pdf-to-markdown")
    @Hidden
    public String convertPdfToMarkdownForm(Model model) {
        model.addAttribute("currentPage", "pdf-to-markdown");
        return "convert/pdf-to-markdown";
    }

    @GetMapping("/url-to-pdf")
    @Hidden
    public String convertURLToPdfForm(Model model) {
        model.addAttribute("currentPage", "url-to-pdf");
        return "convert/url-to-pdf";
    }

    @GetMapping("/file-to-pdf")
    @Hidden
    public String convertToPdfForm(Model model) {
        model.addAttribute("currentPage", "file-to-pdf");
        return "convert/file-to-pdf";
    }

    // PDF TO......

    @GetMapping("/pdf-to-img")
    @Hidden
    public String pdfToimgForm(Model model) {
        boolean isPython = CheckProgramInstall.isPythonAvailable();
        model.addAttribute("isPython", isPython);
        model.addAttribute("currentPage", "pdf-to-img");
        return "convert/pdf-to-img";
    }

    @GetMapping("/pdf-to-html")
    @Hidden
    public ModelAndView pdfToHTML() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-html");
        modelAndView.addObject("currentPage", "pdf-to-html");
        return modelAndView;
    }

    @GetMapping("/pdf-to-presentation")
    @Hidden
    public ModelAndView pdfToPresentation() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-presentation");
        modelAndView.addObject("currentPage", "pdf-to-presentation");
        return modelAndView;
    }

    @GetMapping("/pdf-to-text")
    @Hidden
    public ModelAndView pdfToText() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-text");
        modelAndView.addObject("currentPage", "pdf-to-text");
        return modelAndView;
    }

    @GetMapping("/pdf-to-word")
    @Hidden
    public ModelAndView pdfToWord() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-word");
        modelAndView.addObject("currentPage", "pdf-to-word");
        return modelAndView;
    }

    @GetMapping("/pdf-to-xml")
    @Hidden
    public ModelAndView pdfToXML() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-xml");
        modelAndView.addObject("currentPage", "pdf-to-xml");
        return modelAndView;
    }

    @GetMapping("/pdf-to-csv")
    @Hidden
    public ModelAndView pdfToCSV() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-csv");
        modelAndView.addObject("currentPage", "pdf-to-csv");
        return modelAndView;
    }

    @GetMapping("/pdf-to-pdfa")
    @Hidden
    public String pdfToPdfAForm(Model model) {
        model.addAttribute("currentPage", "pdf-to-pdfa");
        return "convert/pdf-to-pdfa";
    }
}
