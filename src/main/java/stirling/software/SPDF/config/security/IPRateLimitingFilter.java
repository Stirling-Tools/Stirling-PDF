package stirling.software.SPDF.config.security;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;

public class IPRateLimitingFilter implements Filter {

    private final ConcurrentHashMap<String, AtomicInteger> requestCounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AtomicInteger> getCounts = new ConcurrentHashMap<>();
    private final int maxRequests;
    private final int maxGetRequests;
    
    public IPRateLimitingFilter(int maxRequests, int maxGetRequests) {
        this.maxRequests = maxRequests;
        this.maxGetRequests = maxGetRequests;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
    	if (request instanceof HttpServletRequest) {
	    	HttpServletRequest httpRequest = (HttpServletRequest) request;
	        String method = httpRequest.getMethod();
	        String requestURI = httpRequest.getRequestURI(); 
	    	 // Check if the request is for static resources
	        boolean isStaticResource = requestURI.startsWith("/css/") 
	                                || requestURI.startsWith("/js/")
	                                || requestURI.startsWith("/images/")
	                                || requestURI.startsWith("/public/")
	                                || requestURI.startsWith("/pdfjs/")
	                                || requestURI.endsWith(".svg");

	        // If it's a static resource, just continue the filter chain and skip the logic below
	        if (isStaticResource) {
	        	chain.doFilter(request, response);
	            return;
	        }
	        
	        String clientIp = request.getRemoteAddr();
	        requestCounts.computeIfAbsent(clientIp, k -> new AtomicInteger(0));
	        System.out.println(requestCounts.get(clientIp).get() + ", " + requestURI );
	        if (!"GET".equalsIgnoreCase(method)) {
	        	
		        if (requestCounts.get(clientIp).incrementAndGet() > maxRequests) {
		            // Handle limit exceeded (e.g., send error response)
		            response.getWriter().write("Rate limit exceeded");
		            return;
		        }
	        } else {
	        	if (requestCounts.get(clientIp).incrementAndGet() > maxGetRequests) {
		            // Handle limit exceeded (e.g., send error response)
		            response.getWriter().write("GET Rate limit exceeded");
		            return;
		        }
	        }
    	}
    	 chain.doFilter(request, response);
    }
    
    public void resetRequestCounts() {
        requestCounts.clear();
        getCounts.clear();
    }
}
