package stirling.software.SPDF.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ReactRoutingController {

    @GetMapping("/{path:^(?!api|static|robots\\.txt|favicon\\.ico)[^\\.]*$}")
    public String forwardRootPaths() {
        return "forward:/index.html";
    }

    @GetMapping("/{path:^(?!api|static)[^\\.]*}/{subpath:^(?!.*\\.).*$}")
    public String forwardNestedPaths() {
        return "forward:/index.html";
    }
}
