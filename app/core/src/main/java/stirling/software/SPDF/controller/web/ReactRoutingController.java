package stirling.software.SPDF.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ReactRoutingController {

    @GetMapping(
            "/{path:^(?!api|static|robots\\.txt|favicon\\.ico|pipeline|pdfjs|pdfjs-legacy|fonts|images|files|css|js)[^\\.]*$}")
    public String forwardRootPaths() {
        return "forward:/index.html";
    }

    @GetMapping(
            "/{path:^(?!api|static|pipeline|pdfjs|pdfjs-legacy|fonts|images|files|css|js)[^\\.]*}/{subpath:^(?!.*\\.).*$}")
    public String forwardNestedPaths() {
        return "forward:/index.html";
    }
}
