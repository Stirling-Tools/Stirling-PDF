package stirling.software.SPDF.controller.web;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.ModelAndView;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.CheckProgramInstall;

@Controller
@Tag(name = "Convert", description = "Convert APIs")
public class ConverterWebController {

    @GetMapping("/img-to-pdf")
    @Hidden
    public String convertImgToPdfForm(Model model) {
        model.addAttribute("currentPage", "img-to-pdf");
        return "convert/img-to-pdf";
    }

    @GetMapping("/cbz-to-pdf")
    @Hidden
    public String convertCbzToPdfForm(Model model) {
        model.addAttribute("currentPage", "cbz-to-pdf");
        return "convert/cbz-to-pdf";
    }

    @GetMapping("/pdf-to-cbz")
    @Hidden
    public String convertPdfToCbzForm(Model model) {
        model.addAttribute("currentPage", "pdf-to-cbz");
        return "convert/pdf-to-cbz";
    }

    @GetMapping("/cbr-to-pdf")
    @Hidden
    public String convertCbrToPdfForm(Model model) {
        model.addAttribute("currentPage", "cbr-to-pdf");
        return "convert/cbr-to-pdf";
    }

    @GetMapping("/pdf-to-cbr")
    @Hidden
    public String convertPdfToCbrForm(Model model) {
        if (!ApplicationContextProvider.getBean(EndpointConfiguration.class)
                .isEndpointEnabled("pdf-to-cbr")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        model.addAttribute("currentPage", "pdf-to-cbr");
        return "convert/pdf-to-cbr";
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
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        if (properties != null && properties.getSystem() != null) {
            model.addAttribute("maxDPI", properties.getSystem().getMaxDPI());
        } else {
            model.addAttribute("maxDPI", 500); // Default value if not set
        }
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

    @GetMapping("/pdf-to-vector")
    @Hidden
    public String pdfToVectorForm(Model model) {
        model.addAttribute("currentPage", "pdf-to-vector");
        return "convert/pdf-to-vector";
    }

    @GetMapping("/vector-to-pdf")
    @Hidden
    public String vectorToPdfForm(Model model) {
        model.addAttribute("currentPage", "vector-to-pdf");
        return "convert/vector-to-pdf";
    }

    @GetMapping("/eml-to-pdf")
    @Hidden
    public String convertEmlToPdfForm(Model model) {
        model.addAttribute("currentPage", "eml-to-pdf");
        return "convert/eml-to-pdf";
    }

    @GetMapping("/pdf-to-video")
    @Hidden
    public String pdfToVideo(Model model) {
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        if (properties != null && properties.getSystem() != null) {
            model.addAttribute("maxDPI", properties.getSystem().getMaxDPI());
        } else {
            model.addAttribute("maxDPI", 500);
        }
        model.addAttribute("currentPage", "pdf-to-video");
        return "convert/pdf-to-video";
    }
}
