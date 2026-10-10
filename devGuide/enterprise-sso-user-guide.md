# Sign in to your enterprise team with company SSO

Documentation-site draft for the enterprise SaaS SAML release. Publish after the feature is enabled and its live-provider acceptance checks pass.

Company single sign-on lets employees use their organization's identity provider to enter the correct Stirling team. Microsoft Entra ID and other SAML 2.0 providers are supported. Your company controls who is assigned to its application; team leaders manage Stirling membership and seats.

## Set up company SSO as a team leader

You need a Stirling enterprise team enabled for SSO, permission to manage its members, and access to configure your company's SAML application. Start with your ordinary Stirling account. The account that owns the team does not need to be replaced.

1. Open **Settings → Company single sign-on**. If enterprise access has not been enabled for this team, contact Stirling.
2. In Microsoft Entra, create an enterprise application for Stirling and choose **SAML** single sign-on.
3. Copy the **Identifier (Entity ID)** and **Reply URL (ACS)** from Stirling into Entra's Basic SAML Configuration. Include an email-address claim and assign yourself to the application.
4. Download the application's **Federation Metadata XML**, upload it to Stirling and select **Save SAML connection**. Files can be up to 128 KB.
5. Select **Test and connect my account**. Verify your existing Stirling account, then sign in through your company provider. Keep this browser tab open during setup. If asked to sign in again, use your existing password, Google, GitHub or the email verification code sent to your existing account.
6. Check the company identity shown and confirm the connection. Your existing team, leadership, billing and data stay attached to the same account.
7. Return to Company single sign-on. Tell existing members how to connect their accounts, acknowledge the change, and select **Require company SSO**. The leader who completed the test enables the connection.
8. Copy the **Company sign-in link** and share it with employees assigned to the SAML application.

Saving a connection does not immediately change everyone's login. It stays in draft until you require SSO. Changing draft metadata requires another successful test. For certificate rotation or changes to an active connection, contact Stirling support.

## Join as a new employee

Open your company's sign-in link and select **Continue with company SSO**. Sign in using your company's identity provider, check the identity displayed, then select **Continue to my company team** and **Continue**.

Your Stirling account joins the mapped team as a Member if a seat is available. Being an administrator in Entra does not make you a Stirling team leader. Ask an existing leader to grant the appropriate team role.

You can also select **Continue with company SSO** on Stirling's login page and enter your work email if your company's domain has been registered for discovery. The company link works without email discovery.

## Connect an existing team account

Choose **Connect an existing team account** on the company sign-in page. Verify the Stirling account already in this team and complete your company sign-in. You may be asked to sign in again even if another tab is already open: connecting identities needs a recent sign-in.

Your existing account and team role are preserved. Matching email addresses do not automatically combine accounts. If your existing account uses a different email, choose the connection option explicitly and prove access to both identities.

An account in a different team cannot be moved into this enterprise team through this screen. Contact your team leader or Stirling support to resolve membership before connecting it. If you cannot access your existing account, recover that account first.

## Manage members and leavers

Employees assigned to the company SAML application join when they first complete company sign-in. Email invitations are unavailable once company SSO is required. Add seats if your team is full.

To remove an employee:

1. Remove their access to the company's identity-provider application.
2. Open **Users** in Stirling and remove them from the team.

Removal blocks their existing company sessions on subsequent requests. This release has no directory sync: removing someone only in Entra does not automatically remove their Stirling membership or immediately end an existing Stirling session. If they remain eligible for a new company login, they can rejoin as a Member when a seat is available.

Members cannot leave a company-managed team themselves or use an invitation to switch away. They can sign out normally and ask a leader to remove them. Ordinary login and personal API keys cannot access a team that requires company SSO.

## Resolve sign-in problems

| Message or situation | What to do |
| --- | --- |
| Sign in again | Verify your existing account again, then retry the current step. |
| Start company sign-in again | Restart in the same tab. The attempt may have expired, already been used, or been replaced by a configuration change. |
| Company not found | Use the company link supplied by your team leader. Work-email discovery may not be configured. |
| Account connection required | Prove your existing Stirling account so its data and role can be preserved. |
| Wrong company or account | Use the intended company's link and the existing account that belongs to that team. |
| No available seats | Ask a leader to add capacity or remove unused memberships. |
| SAML sign-in is rejected | Ask your company administrator to check application assignment, email claims and SAML configuration. |
| Your organization is locked out | Contact Stirling support. Do not create replacement accounts to recover ownership. |

This release supports SAML company login. Custom enterprise OAuth2/OIDC, automated directory sync and group-based role assignment are not available in this release.
