package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.boot.security.autoconfigure.SecurityAutoConfiguration;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.boot.security.autoconfigure.actuate.web.servlet.ManagementWebSecurityAutoConfiguration;
import org.springframework.boot.security.autoconfigure.web.servlet.SecurityFilterAutoConfiguration;
import org.springframework.boot.security.autoconfigure.web.servlet.ServletWebSecurityAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.billing.BillingCategory;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.controller.api.converters.ConvertPdfToPdfUa;
import stirling.software.proprietary.security.configuration.ee.DynamicLicenseService;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;
import stirling.software.proprietary.service.AiEngineRouter;
import stirling.software.proprietary.service.ua.FontEmbeddingService;
import stirling.software.proprietary.service.ua.PdfUaConversionService;
import stirling.software.proprietary.service.ua.PdfUaValidationService;

/**
 * Real HTTP, multipart PDF conversion and H2 persistence through the production gate and meter.
 * Only the license checker and outbound SaaS client are controlled; authentication is outside this
 * fixture, which sends the automation marker used by server-dispatched pipeline steps.
 */
@SpringBootTest(
        classes = EnterpriseProcessingHttpIntegrationTest.TestApp.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            "spring.datasource.url=jdbc:h2:mem:enterprise-processing;DB_CLOSE_DELAY=-1",
            "spring.jpa.hibernate.ddl-auto=create-drop",
            "spring.jpa.open-in-view=false",
            "stirling.billing.account-link.enabled=true",
            "stirling.billing.account-link.metering.enabled=true"
        })
class EnterpriseProcessingHttpIntegrationTest {

    private static final long SPENT_GRANT = new AccountLinkProperties().getFreeTierUnits();
    private static final int PAGES = 26;
    private static final long PDF_UNITS = 2;
    private static final String BOUNDARY = "enterprise-processing-test";

    @LocalServerPort private int port;
    @Autowired private LicenseKeyChecker licenseChecker;
    @Autowired private AccountLinkClient cloud;
    @Autowired private DeviceCredentialStore credentials;
    @Autowired private EntitlementCache entitlements;
    @Autowired private FreeTierUsageService localUsage;
    @Autowired private FreeTierUsageCounterRepository localCounters;
    @Autowired private FreeTierPeriodRepository periods;
    @Autowired private MeteredInputSignatureRepository signatures;
    @Autowired private UsageCounterRepository cloudCounters;
    @Autowired private AccountLinkSyncStateRepository syncState;
    @Autowired private UsageSyncService sync;
    @Autowired private RequestCompletion completion;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void resetInstance() {
        reset(licenseChecker, cloud);
        credentials.clear();
        entitlements.invalidate();
        entitlements.current();
        localCounters.deleteAll();
        periods.deleteAll();
        signatures.deleteAll();
        cloudCounters.deleteAll();
        syncState.deleteAll();
        when(licenseChecker.premiumTier()).thenReturn(License.ENTERPRISE);
        localUsage.accrue(BillingCategory.AUTOMATION, SPENT_GRANT, null);
        assertThat(localUsage.balance().remainingUnits()).isZero();
    }

    @Test
    void unlinkedEnterpriseProcessesRealPdfPastItsGrantAndPersistsUsage() throws Exception {
        HttpResponse<byte[]> response = convert(pdf());

        assertConvertedPdf(response);
        assertLocalUsage(SPENT_GRANT + PDF_UNITS);
        assertThat(cloudCounters.count()).isZero();
        verifyNoInteractions(cloud);
    }

    @ParameterizedTest
    @EnumSource(
            value = EntitlementState.class,
            names = {"OVER_LIMIT", "REVOKED"})
    void linkedEnterpriseProcessesLocallyWithoutAddingPaygUsage(EntitlementState state)
            throws Exception {
        credentials.save("test-device", "test-secret", 42L);
        LocalDateTime period = LocalDateTime.now().withNano(0);
        InstanceEntitlement blocked =
                new InstanceEntitlement(
                        true,
                        0,
                        100,
                        100L,
                        state,
                        UnitCalcPolicy.DEFAULT,
                        period,
                        period.plusMonths(1),
                        null);
        when(cloud.fetchEntitlement("test-device", "test-secret")).thenReturn(blocked);
        entitlements.invalidate();
        assertThat(entitlements.current().orElseThrow().state()).isEqualTo(state);
        clearInvocations(cloud);

        assertConvertedPdf(convert(pdf()));

        assertLocalUsage(SPENT_GRANT + PDF_UNITS);
        assertThat(cloudCounters.count()).isZero();
        verifyNoInteractions(cloud);
        sync.syncNow();
        verify(cloud, never())
                .reportUsage(
                        anyString(),
                        anyString(),
                        anyLong(),
                        any(),
                        anyLong(),
                        anyLong(),
                        anyLong());

        cloudCounters.saveAndFlush(new UsageCounter(period, "API", 7, period));
        when(cloud.reportUsage(
                        eq("test-device"),
                        eq("test-secret"),
                        anyLong(),
                        eq(period),
                        eq(7L),
                        eq(0L),
                        eq(0L)))
                .thenReturn(blocked);
        sync.syncNow();

        verify(cloud).reportUsage("test-device", "test-secret", 1L, period, 7L, 0L, 0L);
        assertThat(cloudCounters.findByPeriodStart(period).getFirst().getLastSyncedUnits())
                .isEqualTo(7);
        assertLocalUsage(SPENT_GRANT + PDF_UNITS);
    }

    @ParameterizedTest
    @EnumSource(
            value = License.class,
            names = {"NORMAL", "SERVER"})
    void losingEnterpriseStatusRestoresCreditEnforcementWithoutRestart(License nextLicense)
            throws Exception {
        byte[] input = pdf();
        assertConvertedPdf(convert(input));
        assertLocalUsage(SPENT_GRANT + PDF_UNITS);

        when(licenseChecker.premiumTier()).thenReturn(nextLicense);
        HttpResponse<byte[]> response = convert(input);

        assertThat(response.statusCode()).isEqualTo(402);
        assertThat(new String(response.body(), StandardCharsets.UTF_8))
                .contains("ACCOUNT_LINK_REQUIRED", "FREE_TIER_EXHAUSTED");
        assertLocalUsage(SPENT_GRANT + PDF_UNITS);
        assertThat(cloudCounters.count()).isZero();
    }

    @Test
    void failedEnterpriseProcessingDoesNotAccrueUsage() throws Exception {
        HttpResponse<byte[]> response = convert("not a PDF".getBytes(StandardCharsets.UTF_8));

        assertThat(response.statusCode()).isBetween(400, 599).isNotEqualTo(402);
        assertLocalUsage(SPENT_GRANT);
        assertThat(cloudCounters.count()).isZero();
        verifyNoInteractions(cloud);
    }

    private void assertLocalUsage(long expected) {
        assertThat(localUsage.balance().usedUnits()).isEqualTo(expected);
        assertThat(localUsage.balance().usedByCategory()).containsEntry("AUTOMATION", expected);
        assertThat(localCounters.findAll())
                .singleElement()
                .satisfies(counter -> assertThat(counter.getCumulativeUnits()).isEqualTo(expected));
    }

    private static void assertConvertedPdf(HttpResponse<byte[]> response) throws IOException {
        assertThat(response.statusCode()).isEqualTo(200);
        try (PDDocument output = Loader.loadPDF(response.body())) {
            assertThat(output.getNumberOfPages()).isEqualTo(PAGES);
            assertThat(output.getDocumentCatalog().getLanguage()).isEqualTo("en-US");
            assertThat(output.getDocumentCatalog().getStructureTreeRoot()).isNotNull();
        }
    }

    private HttpResponse<byte[]> convert(byte[] pdf) throws Exception {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(
                ("--"
                                + BOUNDARY
                                + "\r\nContent-Disposition: form-data; name=\"fileInput\"; "
                                + "filename=\"input.pdf\"\r\nContent-Type: application/pdf\r\n\r\n")
                        .getBytes(StandardCharsets.UTF_8));
        body.write(pdf);
        body.write(
                ("\r\n--"
                                + BOUNDARY
                                + "\r\nContent-Disposition: form-data; name=\"embedFonts\""
                                + "\r\n\r\nfalse\r\n--"
                                + BOUNDARY
                                + "\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\nen-US\r\n--"
                                + BOUNDARY
                                + "--\r\n")
                        .getBytes(StandardCharsets.UTF_8));
        completion.finished = new CountDownLatch(1);
        HttpResponse<byte[]> response =
                http.send(
                        HttpRequest.newBuilder(
                                        URI.create(
                                                "http://localhost:"
                                                        + port
                                                        + "/api/v1/convert/pdf/ua"))
                                .timeout(Duration.ofSeconds(30))
                                .header("Content-Type", "multipart/form-data; boundary=" + BOUNDARY)
                                .header(InternalApiClient.AUTOMATION_HEADER, "true")
                                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                                .build(),
                        HttpResponse.BodyHandlers.ofByteArray());
        assertThat(completion.finished.await(5, TimeUnit.SECONDS)).isTrue();
        return response;
    }

    private static byte[] pdf() throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < PAGES; i++) {
                document.addPage(new PDPage());
            }
            document.save(out);
            return out.toByteArray();
        }
    }

    /** Response bytes can arrive before afterCompletion commits the metering transaction. */
    static class RequestCompletion implements Filter {
        volatile CountDownLatch finished = new CountDownLatch(0);

        @Override
        public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
                throws IOException, ServletException {
            try {
                chain.doFilter(request, response);
            } finally {
                finished.countDown();
            }
        }
    }

    @SpringBootConfiguration
    @EnableAutoConfiguration(
            exclude = {
                SecurityAutoConfiguration.class, ServletWebSecurityAutoConfiguration.class,
                ManagementWebSecurityAutoConfiguration.class, SecurityFilterAutoConfiguration.class,
                UserDetailsServiceAutoConfiguration.class
            })
    @EntityScan(basePackageClasses = UsageCounter.class)
    @EnableJpaRepositories(basePackageClasses = UsageCounterRepository.class)
    @Import({
        AccountLinkProperties.class, AccountLinkWebMvcConfig.class, InstanceEntitlementGate.class,
        InstanceEntitlementInterceptor.class, FreeTierUsageService.class, LocalUsageService.class,
        UsageMeterService.class, UsageSyncService.class, DeviceCredentialStore.class,
        EntitlementCache.class, DynamicLicenseService.class, TempFileManager.class,
        TempFileRegistry.class, ConvertPdfToPdfUa.class, PdfUaConversionService.class,
        PdfUaValidationService.class, FontEmbeddingService.class, AiEngineRouter.class
    })
    static class TestApp {
        @Bean
        LicenseKeyChecker licenseKeyChecker() {
            return mock(LicenseKeyChecker.class);
        }

        @Bean
        AccountLinkClient accountLinkClient() {
            return mock(AccountLinkClient.class);
        }

        @Bean
        ApplicationProperties applicationProperties() {
            return new ApplicationProperties();
        }

        @Bean
        CustomPDFDocumentFactory pdfDocumentFactory(ApplicationProperties properties) {
            return new CustomPDFDocumentFactory(
                    new PdfMetadataService(properties, "test", true, null));
        }

        @Bean
        RequestCompletion requestCompletion() {
            return new RequestCompletion();
        }
    }
}
