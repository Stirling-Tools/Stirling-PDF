package stirling.software.SPDF.controller.web;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.servlet.ModelAndView;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.config.security.AppUpdateShowService;

@Controller
@Tag(name = "Convert", description = "Convert APIs")
public class ConverterWebController {

    @Autowired private AppUpdateShowService appUpdateShowService;

    @ConditionalOnExpression("#{bookAndHtmlFormatsInstalled}")
    @GetMapping("/book-to-pdf")
    @Hidden
    public String convertBookToPdfForm(Model model) {
        model.addAttribute("currentPage", "book-to-pdf");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/book-to-pdf";
    }

    @ConditionalOnExpression("#{bookAndHtmlFormatsInstalled}")
    @GetMapping("/pdf-to-book")
    @Hidden
    public String convertPdfToBookForm(Model model) {
        model.addAttribute("currentPage", "pdf-to-book");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/pdf-to-book";
    }

    @GetMapping("/img-to-pdf")
    @Hidden
    public String convertImgToPdfForm(Model model) {
        model.addAttribute("currentPage", "img-to-pdf");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/img-to-pdf";
    }

    @GetMapping("/html-to-pdf")
    @Hidden
    public String convertHTMLToPdfForm(Model model) {
        model.addAttribute("currentPage", "html-to-pdf");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/html-to-pdf";
    }

    @GetMapping("/markdown-to-pdf")
    @Hidden
    public String convertMarkdownToPdfForm(Model model) {
        model.addAttribute("currentPage", "markdown-to-pdf");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/markdown-to-pdf";
    }

    @GetMapping("/url-to-pdf")
    @Hidden
    public String convertURLToPdfForm(Model model) {
        model.addAttribute("currentPage", "url-to-pdf");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/url-to-pdf";
    }

    @GetMapping("/pdf-to-img")
    @Hidden
    public String pdfToimgForm(Model model) {
        model.addAttribute("currentPage", "pdf-to-img");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/pdf-to-img";
    }

    @GetMapping("/file-to-pdf")
    @Hidden
    public String convertToPdfForm(Model model) {
        model.addAttribute("currentPage", "file-to-pdf");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/file-to-pdf";
    }

    // PDF TO......

    @GetMapping("/pdf-to-html")
    @Hidden
    public ModelAndView pdfToHTML() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-html");
        modelAndView.addObject("currentPage", "pdf-to-html");
        modelAndView.addObject("showUpdate", appUpdateShowService.showUpdate());
        return modelAndView;
    }

    @GetMapping("/pdf-to-presentation")
    @Hidden
    public ModelAndView pdfToPresentation() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-presentation");
        modelAndView.addObject("currentPage", "pdf-to-presentation");
        modelAndView.addObject("showUpdate", appUpdateShowService.showUpdate());
        return modelAndView;
    }

    @GetMapping("/pdf-to-text")
    @Hidden
    public ModelAndView pdfToText() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-text");
        modelAndView.addObject("currentPage", "pdf-to-text");
        modelAndView.addObject("showUpdate", appUpdateShowService.showUpdate());
        return modelAndView;
    }

    @GetMapping("/pdf-to-word")
    @Hidden
    public ModelAndView pdfToWord() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-word");
        modelAndView.addObject("currentPage", "pdf-to-word");
        modelAndView.addObject("showUpdate", appUpdateShowService.showUpdate());
        return modelAndView;
    }

    @GetMapping("/pdf-to-xml")
    @Hidden
    public ModelAndView pdfToXML() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-xml");
        modelAndView.addObject("currentPage", "pdf-to-xml");
        modelAndView.addObject("showUpdate", appUpdateShowService.showUpdate());
        return modelAndView;
    }

    @GetMapping("/pdf-to-csv")
    @Hidden
    public ModelAndView pdfToCSV() {
        ModelAndView modelAndView = new ModelAndView("convert/pdf-to-csv");
        modelAndView.addObject("currentPage", "pdf-to-csv");
        modelAndView.addObject("showUpdate", appUpdateShowService.showUpdate());
        return modelAndView;
    }

    @GetMapping("/pdf-to-pdfa")
    @Hidden
    public String pdfToPdfAForm(Model model) {
        model.addAttribute("currentPage", "pdf-to-pdfa");
        model.addAttribute("showUpdate", appUpdateShowService.showUpdate());
        return "convert/pdf-to-pdfa";
    }
}
