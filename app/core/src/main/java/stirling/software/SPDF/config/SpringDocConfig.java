package stirling.software.SPDF.config;

// TODO: Migration required - springdoc's GroupedOpenApi (multiple OpenAPI documents
// grouped by path-matching) has NO direct equivalent in quarkus-smallrye-openapi, which
// serves a single document built automatically from @Tag/@Operation/JAX-RS annotations.
// The three groups below (file-processing "/api/v1/**" minus management/system paths,
// management "/api/v1/admin/**" etc., and system "/api/v1/ui-data/**" etc.) plus the
// pdfFileOneOfCustomizer (@Qualifier("pdfFileOneOfCustomizer") OpenApiCustomizer) need to
// be re-expressed. Options:
//   1. Implement org.eclipse.microprofile.openapi.OASFilter providers (registered via
//      mp.openapi.filter or @Provider) for the per-document info()/title/description and for
//      the pdfFileOneOf customization. A single smallrye document cannot be split per-path
//      into 3 named groups, so the grouping/displayName/pathsToMatch/pathsToExclude behavior
//      is lost unless multiple smallrye-openapi profiles/configs are introduced.
//   2. Set the single top-level title/description via application.properties
//      (quarkus.smallrye-openapi.info-title / info-description) and drop grouping.
// Preserving the original group metadata here as reference until the OASFilter(s) are written.
//
// Original groups (springdoc):
//   group "file-processing" (displayName "File Processing"):
//     pathsToMatch: /api/v1/**
//     pathsToExclude: /api/v1/admin/**, /api/v1/user/**, /api/v1/settings/**, /api/v1/team/**,
//       /api/v1/auth/**, /api/v1/invite/**, /api/v1/audit/**, /api/v1/ui-data/**,
//       /api/v1/proprietary/ui-data/**, /api/v1/info/**, /api/v1/general/job/**,
//       /api/v1/general/files/**, /api/v1/general/signatures/**, /api/v1/database/**,
//       /api/v1/storage/**, /api/v1/proprietary/signatures/**, /api/v1/workflow/participant/**,
//       /api/v1/security/cert-sign/sessions, /api/v1/security/cert-sign/sessions/**,
//       /api/v1/security/cert-sign/sign-requests, /api/v1/security/cert-sign/sign-requests/**,
//       /api/v1/security/cert-sign/validate-certificate
//     customizers: pdfFileOneOfCustomizer; info.title "Stirling PDF - Processing API",
//       description "APIs for converting, editing, securing, and analysing PDF documents. Use
//       these endpoints to automate common PDF tasks (like split, merge, convert, OCR) and plug
//       them into your own apps and backend jobs."
//   group "management" (displayName "Management"):
//     pathsToMatch: /api/v1/admin/**, /api/v1/user/**, /api/v1/settings/**, /api/v1/team/**,
//       /api/v1/auth/**, /api/v1/invite/**, /api/v1/audit/**, /api/v1/database/**,
//       /api/v1/storage/**, /api/v1/proprietary/signatures/**, /api/v1/workflow/participant/**,
//       /api/v1/security/cert-sign/sessions, /api/v1/security/cert-sign/sessions/**,
//       /api/v1/security/cert-sign/sign-requests, /api/v1/security/cert-sign/sign-requests/**,
//       /api/v1/security/cert-sign/validate-certificate
//     info.title "Stirling PDF - Management API", description "Endpoints for authentication,
//       user management, invitations, audit logging, and system configuration."
//   group "system" (displayName "System & UI API"):
//     pathsToMatch: /api/v1/ui-data/**, /api/v1/proprietary/ui-data/**, /api/v1/info/**,
//       /api/v1/general/job/**, /api/v1/general/files/**, /api/v1/general/signatures/**
//     info.title "Stirling PDF - System API", description "System information, UI metadata,
//       job status, and file management endpoints."
public class SpringDocConfig {
    // All springdoc GroupedOpenApi @Bean producers removed; smallrye-openapi builds the
    // document from annotations. See the TODO above for how to restore grouping/customizers.
}
