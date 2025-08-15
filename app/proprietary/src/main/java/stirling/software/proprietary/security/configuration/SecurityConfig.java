package stirling.software.proprietary.security.configuration;



import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.event.AbstractAuthenticationEvent;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationEntryPoint;
import org.springframework.security.oauth2.server.resource.web.access.BearerTokenAccessDeniedHandler;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Security configuration for Supabase-issued JWTs only.
 *
 * Requires:
 *
 * spring:
 *   security:
 *     oauth2:
 *       resourceserver:
 *         jwt:
 *           issuer-uri: https://<project-id>.supabase.co/auth/v1
 *
 * Optional logging (application.yml):
 * logging:
 *   level:
 *     org.springframework.security: DEBUG
 *     your.project.pkg.security: DEBUG
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

  private static final Logger log = LoggerFactory.getLogger(SecurityConfig.class);

  /** Your Supabase project ref, e.g. abcd1234efgh5678ijkl */
  @Value("${app.supabase.project-ref:nrlkjfznsavsbmweiyqu}")
  private String projectRef;

  /** Optional audience to enforce (leave empty to skip) */
  @Value("${app.jwt.expected-aud:}")
  private String expectedAud;

  /** Clock skew in seconds for exp validation */
  @Value("${app.jwt.clock-skew-seconds:120}")
  private long clockSkewSeconds;

  @Bean
  SecurityFilterChain securityFilterChain(HttpSecurity http, JwtDecoder jwtDecoder) throws Exception {
    http
      .csrf(AbstractHttpConfigurer::disable)
      .cors(Customizer.withDefaults())
      .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
      .authorizeHttpRequests(auth -> auth
        // allow CORS preflight only
        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
        // public endpoints
        .requestMatchers(
          new AntPathRequestMatcher("/actuator/health"),
          new AntPathRequestMatcher("/public/**"),
          new AntPathRequestMatcher("/images/**"),
          new AntPathRequestMatcher("/css/**"),
          new AntPathRequestMatcher("/js/**")
        ).permitAll()
        // everything else requires auth
        .anyRequest().authenticated()
      )
      .addFilterBefore(new VerboseAuthLoggingFilter(), BearerTokenAuthenticationFilter.class)
      .exceptionHandling(ex -> ex
        .authenticationEntryPoint(new BearerTokenAuthenticationEntryPoint())
        .accessDeniedHandler(new BearerTokenAccessDeniedHandler())
      )
      .oauth2ResourceServer(oauth -> oauth
        .jwt(jwt -> jwt
          .decoder(jwtDecoder)
          .jwtAuthenticationConverter(this::toAuthentication)
        )
      );

    return http.build();
  }

  /** CORS config so browser can send Authorization on real requests. */
  @Bean
  CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration cfg = new CorsConfiguration();
    cfg.setAllowedOrigins(List.of(
      "http://localhost:3000",          // dev
      "http://localhost:5173",  
      "http://localhost:8080",  
      "https://your-frontend.example"// prod
    ));
    cfg.setAllowedMethods(List.of("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
    cfg.setAllowedHeaders(List.of("Authorization","Content-Type","X-Requested-With","Accept","Origin"));
    cfg.setExposedHeaders(List.of("WWW-Authenticate"));
    cfg.setAllowCredentials(true);
    cfg.setMaxAge(3600L);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", cfg);
    return source;
  }

  /** JWKS-based decoder + custom validator (issuer/exp/aud). */
  @Bean
  JwtDecoder jwtDecoder() {
    String issuer = "https://" + projectRef + ".supabase.co/auth/v1"; // no trailing slash
    String jwks   = issuer + "/.well-known/jwks.json";

    log.info("Configuring JWT decoder with JWKS: {}", jwks);
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwks).build();
    decoder.setJwtValidator(new CompositeValidator(issuer, expectedAud, Duration.ofSeconds(clockSkewSeconds)));

    if (expectedAud == null || expectedAud.isBlank()) {
      log.info("JWT validation: enforcing issuer='{}' and exp (skew {}s)", issuer, clockSkewSeconds);
    } else {
      log.info("JWT validation: enforcing issuer='{}', audience='{}', and exp (skew {}s)",
               issuer, expectedAud, clockSkewSeconds);
    }
    return decoder;
  }

  /** Map claims -> authorities. DEBUG: hotmail.com => ROLE_ADMIN. */
  private AbstractAuthenticationToken toAuthentication(Jwt jwt) {
    List<GrantedAuthority> authorities = new ArrayList<>();

    // Supabase default role -> ROLE_authenticated (optional but handy)
    String supabaseRole = jwt.getClaimAsString("role"); // often "authenticated"
    if (supabaseRole != null && !supabaseRole.isBlank()) {
      authorities.add(new SimpleGrantedAuthority("ROLE_" + supabaseRole));
    }

    // Your custom app_role (if you add it via Access Token Hook) -> ROLE_*
    String appRole = jwt.getClaimAsString("app_role");
    if (appRole != null && !appRole.isBlank()) {
      authorities.add(new SimpleGrantedAuthority("ROLE_" + appRole.toUpperCase()));
    }

    // DEBUG RULE: email domain → admin
    String email = jwt.getClaimAsString("email");
    if (email != null && email.toLowerCase(Locale.ROOT).endsWith("@hotmail.com")) {
      authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
    } else {
      // Give a basic user role for convenience while debugging (optional)
      authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
    }

    // Optional permissions array -> PERM_*
    List<String> perms = jwt.getClaimAsStringList("permissions");
    if (perms != null) {
      perms.stream()
        .filter(p -> p != null && !p.isBlank())
        .map(p -> new SimpleGrantedAuthority("PERM_" + p))
        .forEach(authorities::add);
    }

    String principalName = (email != null && !email.isBlank()) ? email : jwt.getSubject();

    if (log.isDebugEnabled()) {
      log.debug("JWT accepted: sub='{}', email='{}', supabase.role='{}', app_role='{}', permissions={}",
        jwt.getSubject(), email, supabaseRole, appRole, perms);
      log.debug("Granted authorities: {}", authorities.stream()
        .map(GrantedAuthority::getAuthority).collect(Collectors.toList()));
    }

    return new JwtAuthenticationToken(jwt, authorities, principalName);
  }

  /** Logs authentication lifecycle events (success/failure). */
  @Bean
  ApplicationListener<AbstractAuthenticationEvent> authenticationEventsLogger() {
    return event -> {
      try {
        if (event.getSource() instanceof AbstractAuthenticationToken auth) {
          String type = event.getClass().getSimpleName();
          String name = auth.getName();
          String authorities = auth.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority).collect(Collectors.joining(","));
          log.debug("[AuthEvent] {} principal='{}' authorities='{}' details={}",
            type, name, authorities, auth.getDetails());
        } else {
          log.debug("[AuthEvent] {} source={}", event.getClass().getSimpleName(), event.getSource());
        }
      } catch (Exception e) {
        log.warn("Failed to log authentication event", e);
      }
    };
  }

  /** Super-chatty per-request logger around bearer processing; never logs raw token. */
  static class VerboseAuthLoggingFilter extends OncePerRequestFilter {
    private static final Logger flog = LoggerFactory.getLogger(VerboseAuthLoggingFilter.class);

    @Override
    protected void doFilterInternal(
      @NonNull HttpServletRequest request,
      @NonNull HttpServletResponse response,
      @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

      String authHeader = request.getHeader("Authorization");
      boolean hasBearer = authHeader != null && authHeader.startsWith("Bearer ");
      if (flog.isDebugEnabled()) {
        flog.debug("[REQ] {} {} AuthorizationHeaderPresent={} (token hidden)",
          request.getMethod(), request.getRequestURI(), hasBearer);
      }

      try {
        filterChain.doFilter(request, response);
      } catch (InvalidBearerTokenException ibte) {
        flog.warn("[AUTH] Invalid bearer token: {}", ibte.getMessage());
        throw ibte;
      } catch (Exception ex) {
        flog.error("[AUTH] Unexpected auth error: {}", ex.toString(), ex);
        throw ex;
      }

      var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
      if (auth instanceof JwtAuthenticationToken jwtAuth) {
        String authorities = jwtAuth.getAuthorities().stream()
          .map(GrantedAuthority::getAuthority).collect(Collectors.joining(","));
        flog.debug("[AUTH] OK principal='{}' authorities='{}'", jwtAuth.getName(), authorities);
      } else {
        flog.debug("[AUTH] No authentication established");
      }
    }
  }

  /** Validator: issuer == expected, not expired (with skew), optional audience. */
  static final class CompositeValidator implements OAuth2TokenValidator<Jwt> {
    private final String expectedIssuer;         // not null
    private final String expectedAudienceOrNull; // may be null/blank
    private final Duration skew;

    CompositeValidator(String expectedIssuer, String expectedAudienceOrNull, Duration skew) {
      this.expectedIssuer = Objects.requireNonNull(expectedIssuer);
      this.expectedAudienceOrNull = (expectedAudienceOrNull != null && !expectedAudienceOrNull.isBlank())
        ? expectedAudienceOrNull : null;
      this.skew = Objects.requireNonNull(skew);
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
      List<OAuth2Error> errors = new ArrayList<>();

      String iss = token.getIssuer() != null ? token.getIssuer().toString() : null;
      if (iss == null || !iss.equals(expectedIssuer)) {
        errors.add(new OAuth2Error("invalid_token", "Invalid issuer: " + iss, null));
      }

      Instant exp = token.getExpiresAt();
      if (exp == null) {
        errors.add(new OAuth2Error("invalid_token", "Missing exp claim", null));
      } else if (exp.isBefore(Instant.now().minus(skew))) {
        errors.add(new OAuth2Error("invalid_token", "Token expired at " + exp, null));
      }

      if (expectedAudienceOrNull != null) {
        List<String> aud = token.getAudience();
        if (aud == null || !aud.contains(expectedAudienceOrNull)) {
          errors.add(new OAuth2Error("invalid_token", "Missing/invalid audience: " + expectedAudienceOrNull, null));
        }
      }

      if (!errors.isEmpty()) {
        errors.forEach(e -> log.warn("JWT validation error: {} - {}", e.getErrorCode(), e.getDescription()));
        return OAuth2TokenValidatorResult.failure(errors);
      }
      return OAuth2TokenValidatorResult.success();
    }
  }
}