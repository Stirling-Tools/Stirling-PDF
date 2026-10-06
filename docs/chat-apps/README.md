# Stirling PDF in Claude and ChatGPT

Stirling PDF ships as one MCP server (`https://api.stirling.com/mcp`) that both Claude and ChatGPT can use as an app. Nothing separate is built per vendor: the same server, tools and in-chat widget serve both.

## What the server provides

- **Tools with titles and annotations.** Every tool declares `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`, which both directories require.
- **In-chat widget (MCP Apps).** `ui://stirling-pdf/app.html` (`text/html;profile=mcp-app`) renders a file card with a Download button for results, and a file picker when `stirling_select_file` is called.
- **Getting user files in.**
  - ChatGPT: attachments arrive through `openai/fileParams` as `inputFile` (`download_url`). The server only fetches HTTPS URLs on `mcp.fileUrlAllowedHosts` that resolve to public addresses.
  - Claude: the picker widget uploads the chosen file straight to `stirling_upload`, so the bytes never pass through the model.
- **Getting results out.** Results are stored as temporary files in server storage and returned as a short summary plus a download link, not as an inline base64 blob. Claude rejects tool results over about 150k characters, so the old blob broke on any real PDF.
  - The `fileId` is the stored file's id, so every tool can chain on it.
  - Temporary files are hidden from the file manager and deleted after `mcp.resultTtlMinutes` (default 60).
  - The download link is a share link marked public, so it opens without a login, and it expires with the file. Ordinary share links still require sign-in.
- **Domain verification.** `/.well-known/openai-apps-challenge` serves `mcp.openaiAppsChallenge`.

## SaaS go-live config (api.stirling.com)

The existing `MCP_*` auth settings stay as they are. Add these:

| Env var | Value | Why |
| --- | --- | --- |
| `STORAGE_ENABLED` | `true` (the default) | MCP results live in server storage |
| `STORAGE_SHARING_ENABLED` | `true` | Needed for download links; without it results still work through `fileId` but have no link |
| `SYSTEM_FRONTENDURL` | `https://stirling.com/app` | Share links are off without it |
| `MCP_PUBLICBASEURL` | `https://api.stirling.com` | Only needed if `MCP_AUTH_RESOURCEID` is not `https://api.stirling.com/mcp` |
| `MCP_MAXREQUESTBYTES` | `41943040` (40 MB) | The picker sends base64 in the request; 10 MB allows only about 7 MB files |
| `MCP_CHATGPTWIDGETDOMAIN` | Value from the OpenAI dashboard | Required for ChatGPT apps that have UI |
| `MCP_OPENAIAPPSCHALLENGE` | Token from the OpenAI dashboard | Domain verification |

The OAuth chain checked out against prod on 2026-10-06:
- An unauthenticated call gets `401` with `resource_metadata`.
- The protected resource metadata `resource` is exactly `https://api.stirling.com/mcp`.
- Supabase advertises dynamic client registration, PKCE S256 and `none` client auth.

Supabase has no CIMD and does not send the RFC 9207 `iss` parameter, so both Claude and ChatGPT fall back to dynamic registration. That fallback is supported.

**Ship blocker:** the reconnect fix for the consent page (`fix/saas-oauth-consent-reconnect`, commit 6d11eecbcf) is not on main or SaaS. Without it, every second connect fails with "Could not submit your decision". Reviewers reconnect, so merge that fix first.

## Testing before submission

1. **Automated:** `./gradlew :proprietary:test --tests 'stirling.software.proprietary.mcp.*' --tests '*FileStorageService*'`
2. **Real server:** run with `MCP_ENABLED=true MCP_AUTH_MODE=apikey STORAGE_SHARING_ENABLED=true SYSTEM_FRONTENDURL=http://localhost:8080`, then:
   - Run MCP Inspector (`npx @modelcontextprotocol/inspector`) against `http://localhost:8080/mcp` with an `X-API-KEY` header.
   - Call every tool once. Both submission forms ask you to confirm this.
3. **Claude:** Settings, Connectors, Add custom connector, `https://api.stirling.com/mcp` (or a public HTTPS tunnel to staging). Sign in, then try the prompts below.
4. **ChatGPT:** Settings, Apps, Advanced, Developer mode, Create app, same URL, OAuth. Attach a PDF and try the prompts below.

**Prompts that cover every path:**
- "Compress this PDF" with an attachment. This covers ChatGPT `fileParams`.
- "I want to compress a PDF from my computer." This covers the picker in Claude, plus upload and follow-up.
- "Convert this PDF to Word". This covers describe followed by convert.
- "Rotate it 90 degrees" on the previous result. This covers fileId reuse.
- "Add a password to it". This covers the security tool.

## Claude: Connectors Directory submission

Submit at https://claude.ai/directory/manage, then Submit new, then MCP connector.

| Field | Value |
| --- | --- |
| Connection | `https://api.stirling.com/mcp` (Universal URL) |
| Name | Stirling PDF |
| One-liner | Edit, convert, compress, secure and sign PDFs. |
| Description | Same as the ChatGPT `longDescription` in [`chatgpt-plugin/plugin.json`](chatgpt-plugin/plugin.json) |
| Categories | Productivity, Documents |
| Docs URL | https://docs.stirlingpdf.com |
| Privacy policy | https://www.stirling.com/legal/privacy-policy |
| Support | https://www.stirling.com/contact-us |
| Icon | `chatgpt-plugin/assets/logo.svg` |
| Auth | `oauth_dcr` |
| Reads/writes | Both. It reads uploaded files and writes new result files; originals are never changed. |
| Allowed link URIs | `https://api.stirling.com` (Download button opens a public share link there) |
| Test account | Dedicated Stirling account with password login, no MFA |
| Screenshots | 3 to 5 PNGs, at least 1000 px wide, cropped to the widget: picker, file card, error card |

## ChatGPT: plugin submission

1. Zip the contents of [`chatgpt-plugin/`](chatgpt-plugin), keeping `plugin.json` at the root.
2. Upload the zip at https://platform.openai.com/plugins. This needs an org Owner and a verified business.
3. Enter the test account in "Review details". It must not be in the zip.
4. Before uploading:
   - Add a demo video URL and screenshots.
   - Paste the domain challenge token into `MCP_OPENAIAPPSCHALLENGE`.
   - Paste the widget domain into `MCP_CHATGPTWIDGETDOMAIN`.
5. After later server changes, use "Rescan" in the dashboard. Metadata-only changes go live without a new review.

## Known review risks

- **Category tools take an `operation` argument.** Claude's criteria reject a catch-all tool with a `method` parameter that mixes reads and writes. Ours are grouped by category and every operation produces a new file, but a reviewer may still flag it. The fallback is one tool per operation, generated from the catalogue.
- **Descriptions mention `stirling_describe_operation`.** Pointing to our own tools is normal, but the criteria warn against descriptions that tell the model to call other tools. Reword if a reviewer objects.
- **`stirling_ai` mixes Q&A (read) and edit plans (write).** Consider splitting it, or hiding it from the directory build with `mcp.blockedOperations`.
- **`ui.domain` is per host.** Claude expects `<sha256>.claudemcpcontent.com`, ChatGPT its own domain. We send only `openai/widgetDomain`, which Claude ignores. Claude only needs `ui.domain` for OAuth inside the widget, which we do not do.
