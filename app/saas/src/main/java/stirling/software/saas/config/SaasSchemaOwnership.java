package stirling.software.saas.config;

import java.util.Set;

/**
 * Which side owns each table in the SaaS database.
 *
 * <p>The SaaS schema has two writers and always has: the Supabase migrations in the
 * Stirling-PDF-SaaS repo, and Hibernate's {@code ddl-auto}. That was a convention rather than a
 * rule, and it leaked twice. An older {@code ddl-auto} run widened {@code team_memberships.role} to
 * varchar(255), which needed a dedicated migration to repair because RLS policies depended on the
 * column. Separately {@code payg_instance_usage} went months with an entity and no migration, so it
 * simply did not exist on a fresh preview branch.
 *
 * <p>This class makes the boundary explicit and {@code SaasSchemaOwnershipTest} makes it binding:
 * every {@code @Entity} the SaaS app maps must appear in exactly one of these two sets. A new
 * entity fails the build until someone states who owns its table, which is the decision that was
 * previously made by accident.
 *
 * <p>{@link MigrationOwnedSchemaFilter} enforces it at runtime: Hibernate is never shown the
 * migration-owned tables, so it cannot create, alter or drop them whatever {@code ddl-auto} says.
 * Inherited tables stay under Hibernate, so a preview branch built from migrations alone still
 * heals itself on first boot.
 *
 * <p><b>What this does not catch.</b> The register is a hand-maintained copy of what lives in
 * another repository, and only one direction is enforced. The test fails when a *new* entity
 * appears with no owner. It cannot notice a table changing sides: write a migration for {@code
 * folders} in Stirling-PDF-SaaS and nothing here changes, the test still passes, and Hibernate
 * carries on managing a table the migrations now own — which is precisely how {@code
 * team_memberships.role} got widened. Adding a migration for anything in {@link #HIBERNATE_MANAGED}
 * therefore means moving it to {@link #MIGRATION_OWNED} in the same change; nothing will remind
 * you. Making that structural rather than remembered is what moving the SaaS tables into their own
 * schema would buy, and is the reason this class is a stepping stone rather than the answer.
 */
public final class SaasSchemaOwnership {

    /**
     * Created and altered by the Supabase migrations. Hibernate must not touch these: the
     * migrations carry constraints, defaults and RLS policies it knows nothing about and would
     * reconcile away.
     */
    public static final Set<String> MIGRATION_OWNED =
            Set.of(
                    "account_link_connect_request",
                    "ai_create_sessions",
                    "audit_events",
                    "authorities",
                    "billing_subscriptions",
                    "job_artifact_hash",
                    "legal_consent",
                    "linked_instance",
                    "payg_instance_usage",
                    "payg_meter_event_log",
                    "payg_prepaid_bundle",
                    "payg_shadow_charge",
                    "payg_team_extensions",
                    "persistent_logins",
                    "pricing_policy",
                    "processing_job",
                    "processing_job_step",
                    "procurement_agreement_signature",
                    "procurement_deal",
                    "procurement_quote",
                    "saas_team_extensions",
                    "saas_user_extensions",
                    "sessions",
                    "team_invitations",
                    "team_memberships",
                    "teams",
                    "users",
                    "wallet_entitlement_snapshot",
                    "wallet_ledger",
                    "wallet_policy");

    /**
     * Inherited from the self-hosted app, where {@code ddl-auto} owns the schema and no Supabase
     * migration exists. Deliberately left under Hibernate so a fresh branch gets them on first
     * boot.
     */
    public static final Set<String> HIBERNATE_MANAGED =
            Set.of(
                    "account_link_connect_state",
                    "account_link_device_credential",
                    "account_link_metered_signature",
                    "account_link_sync_state",
                    "account_link_usage_counter",
                    "api_key_daily_usage",
                    "api_keys",
                    "file_encryption_keys",
                    "file_run_events",
                    "file_share_accesses",
                    "file_shares",
                    "folders",
                    "gmail_oauth_connections",
                    "integration_configs",
                    "invite_tokens",
                    "jwt_signing_keys",
                    "policies",
                    "policy_assets",
                    "policy_completed_migrations",
                    "policy_processed_files",
                    "policy_source_doc_counts",
                    "policy_source_doc_totals",
                    "policy_sources",
                    "resource_grants",
                    "storage_cleanup_entries",
                    "stored_file_blobs",
                    "stored_files",
                    "user_license_settings",
                    "user_server_certificates",
                    "workflow_participants",
                    "workflow_sessions");

    private SaasSchemaOwnership() {}

    /** Case-insensitive: Hibernate hands us whatever casing the mapping used. */
    public static boolean isMigrationOwned(String tableName) {
        return tableName != null && MIGRATION_OWNED.contains(tableName.toLowerCase());
    }
}
