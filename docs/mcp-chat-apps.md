# Connect ChatGPT and Claude to self-hosted Stirling PDF

Stirling PDF's MCP server lets ChatGPT and Claude run Stirling tools on your own server. This guide covers what a self-hosted deployment needs before those apps can connect: public HTTPS, an OAuth identity provider, a reverse proxy that passes MCP traffic through untouched, and the settings that control result files.

## What you need

| Requirement | Why |
| --- | --- |
| A public HTTPS URL on port 443, for example `https://pdf.example.com` | ChatGPT and Claude call your server from their own cloud, never from your network. Use the standard port: in testing ChatGPT never connected to a server on a custom port. |
| `mcp.auth.mode: oauth` and an identity provider (IdP) | ChatGPT and Claude only sign in with OAuth. They cannot send a custom header, so API keys do not work for them. |
| Login enabled (`security.enableLogin: true`) with a Stirling account for each person | Every MCP call runs as a Stirling user, matched from a token claim. |
| Storage and sharing enabled | Results are kept as the user's temporary files and handed back as links. See [Result files and links](#result-files-and-links). |

API keys (`mcp.auth.mode: apikey`) suit clients that can send headers, such as Claude Code or Claude Desktop through `mcp-remote`. See [Header-based clients](#header-based-clients-api-key).

## Settings

A minimal OAuth setup, as environment variables:

```bash
MCP_ENABLED=true
MCP_AUTH_MODE=oauth
# Must equal the token's iss exactly.
MCP_AUTH_ISSUERURI=https://id.example.com/realms/stirling
# Tokens must carry this in aud.
MCP_AUTH_RESOURCEID=https://pdf.example.com/mcp
MCP_AUTH_USERNAMECLAIM=email
MCP_AUTH_REQUIREEXISTINGACCOUNT=true
SYSTEM_FRONTENDURL=https://pdf.example.com
SYSTEM_BACKENDURL=https://pdf.example.com
STORAGE_ENABLED=true
STORAGE_SHARING_ENABLED=true
```

`system.frontendUrl` is also the domain ChatGPT shows the in-chat app under, so set it to the public URL. `mcp.auth.jwksUri` can point at an internal address of your IdP when Stirling cannot reach the public one; the issuer check still uses `issuerUri`.

These settings control what chat apps get back. Set them in `settings.yml` under `mcp:` or as `MCP_*` environment variables (lists are comma-separated in environment variables).

| Setting | Default | What it does |
| --- | --- | --- |
| `mcp.storeResults` | `true` | Keep results as the user's hidden temporary files. Needs `storage.enabled` and `security.enableLogin`; otherwise results fall back to the shared temp store and get no links. |
| `mcp.resultTtlMinutes` | `60` | How long stored results, and their links, last. |
| `mcp.downloadLinks` | `private` | `private`: the link opens Stirling PDF and the user signs in. `public`: anyone with the link can download until it expires. `off`: no links, results are reachable by `fileId` only. |
| `mcp.inlineResults` | `auto` | Also return the file as base64, up to `mcp.maxInlineResponseBytes`. `auto` does this only when results are not stored files; `always` and `never` force it. Large inline files break ChatGPT and Claude, so keep `auto` or `never`. |
| `mcp.widgetEnabled` | `true` | Serve the in-chat app: a result card (`ui://stirling-pdf/app.html`) with **Open in Stirling PDF** and **Download** buttons, and a file picker (`ui://stirling-pdf/picker.html`) for sending a file from the user's device. |
| `mcp.fileUrlAllowedHosts` | `oaiusercontent.com`, `openai.com`, `chatgpt.com`, `oaisdmntpr*.blob.core.windows.net` | Hosts Stirling may download chat attachments from. See [Attachments](#attachments). |
| `mcp.maxFileUrlBytes` | `104857600` (100 MB) | Largest attachment Stirling downloads. |
| `mcp.maxRequestBytes` | `10485760` (10 MB) | Largest MCP request, including files sent inline as base64. |
| `mcp.syncWaitSeconds` | `100` | How long a tool call waits for an operation. After that it returns a job id the assistant polls with `stirling_job_status`, so long OCR jobs beat the chat app's timeout. `0` always waits. |
| `mcp.rateLimitPerMinute` | `60` | Tool calls each user may make per minute, shared across nodes. `0` is unlimited. |
| `mcp.automationsEnabled` | `true` | Let assistants run several operations in one call (`stirling_run_pipeline`) and list, run and save the team's pipelines. Saving still needs an admin or team leader, as in Stirling's Pipelines page. |
| `mcp.maxPipelineSteps` | `10` | Most operations one pipeline call may chain. |

Failed calls carry `structuredContent.error` with a `code` (such as `invalid_parameters`, `input_unavailable`, `rate_limited`, `operation_failed`), the `stage` that failed, whether a `retryable` fix exists, and for server faults a short `ref` that matches the server log line. `stirling_describe_operation` returns a minimal worked example call for each operation.

Every tool call is written to the audit log as `MCP_TOOL_CALL` (tool, operation, outcome and duration, never the arguments) and counted in the `stirling.mcp.tool.calls` and `stirling.mcp.tool.duration` metrics.

## Reverse proxy

Put Stirling PDF behind a proxy that terminates TLS on 443 and passes MCP requests straight through.

- **Body size**: allow at least `mcp.maxRequestBytes` plus headroom. Files sent inline or through the file picker travel as base64 inside the request, which adds about a third.
- **Timeouts**: long operations such as OCR or office conversion hold the request open. Allow several minutes for reads and sends.
- **Buffering off**: stream responses instead of buffering them.
- **Forwarded headers**: send `X-Forwarded-Proto` and `X-Forwarded-Host`. Stirling uses them to build the `resource_metadata` URL in its `401` response; without them clients are pointed at `http://` and the connection fails. Stirling trusts these headers from proxies on private addresses; if your proxy connects from a public address, configure trusted proxies (for example `server.tomcat.remoteip.internal-proxies`).

nginx:

```nginx
server {
    listen 443 ssl;
    server_name pdf.example.com;

    client_max_body_size 200m;

    location / {
        proxy_pass http://stirling-pdf:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Caddy sets the forwarded headers itself:

```caddy
pdf.example.com {
    request_body {
        max_size 200MB
    }
    reverse_proxy stirling-pdf:8080 {
        flush_interval -1
    }
}
```

## Identity provider

ChatGPT and Claude register themselves with your IdP and sign the user in there. The IdP must:

- Let clients register themselves, through Dynamic Client Registration (RFC 7591) or Client ID Metadata Documents.
- Support PKCE with `S256`.
- Return `iss` in the authorization response (RFC 9207) and advertise `authorization_response_iss_parameter_supported`.
- Issue access tokens whose `aud` includes `https://pdf.example.com/mcp`, exactly as in `mcp.auth.resourceId`. If your IdP cannot mint that audience, list the audience it does issue in `mcp.auth.acceptedAudiences`.
- Grant the `mcp.tools.read` and `mcp.tools.write` scopes to registered clients, or set `mcp.scopesEnabled: false`.
- Grant `offline_access`. ChatGPT asks for it to get refresh tokens, and sign-in fails if the IdP refuses.
- Put the claim named in `mcp.auth.usernameClaim` (for example `email`) in the token, matching a Stirling username.
- Be reachable over public HTTPS, since the chat apps fetch its metadata and sign-in page directly.

### Keycloak

- **Hostname**: set `KC_HOSTNAME` to the public URL and `KC_PROXY_HEADERS=xforwarded` behind a proxy, so the issuer is the public one.
- **Client registration**: under **Clients > Client registration > Anonymous access policies**, add the chat apps' redirect hosts to **Trusted Hosts** (`chatgpt.com` and `openai.com` for ChatGPT, `claude.ai` for Claude) and keep **Allowed Client Scopes** allowing the default scopes.
- **Scopes**: create `mcp.tools.read` and `mcp.tools.write` client scopes and add them to the realm's default client scopes, so self-registered clients get them.
- **Audience**: add a default client scope with an **Audience** mapper whose included custom audience is `https://pdf.example.com/mcp`. Keycloak ignores the `resource` parameter, so the mapper is what puts `/mcp` in `aud`.
- **offline_access**: keep `offline_access` as an optional client scope and make sure every user has the `offline_access` realm role (it comes from the realm's default roles unless removed).

`testing/compose/keycloak-realm-mcp.json` is a working realm with these pieces in place.

## Connect the apps

Use `https://pdf.example.com/mcp` as the server URL and OAuth as the authentication method.

- **ChatGPT**: add it as a custom app or connector with OAuth. ChatGPT registers itself, sends the user to your IdP to sign in, then lists Stirling's tools.
- **Claude**: add it as a custom connector (**Settings > Connectors**). Claude registers itself and signs in the same way.

Stirling speaks MCP `2026-07-28` as well as the older `initialize` handshake, so clients on either work with nothing to configure. When an app can show forms, Stirling asks the user for PDF passwords directly, so passwords never pass through the model.

With file storage on, ChatGPT also gets:

- **Your Stirling files** in its sidebar, to upload files or send a stored one to the chat.
- **@-mentions** of stored files by name in the composer (ChatGPT desktop).
- **ChatGPT's own file picker** when the assistant asks for a file, listing recent Stirling files next to an upload.

Assistants can also chain operations in one call ("repair, OCR, then compress this") and set up automations themselves: a team pipeline with its steps, a source and trigger (schedule, watched folder or storage, webhook) so it runs on its own, and a destination for results. These appear in Stirling's Pipelines page. Sources and destinations must already exist; assistants pick from them but never create connections or credentials. Steps always run as the signed-in user and are limited to the operations MCP exposes, so `mcp.allowedOperations` and `mcp.blockedOperations` apply to every step.

### Header-based clients (API key)

With `mcp.auth.mode: apikey`, a client sends a Stirling API key (**Settings > Preferences > API Keys**) as `X-API-KEY` or `Authorization: Bearer`. No IdP is involved, but only clients that can add headers can connect.

Claude Code:

```bash
claude mcp add --transport http stirling-pdf https://pdf.example.com/mcp --header "X-API-KEY: <your-key>"
```

Claude Desktop through `mcp-remote`:

```json
{
  "mcpServers": {
    "stirling-pdf": {
      "command": "npx",
      "args": ["mcp-remote", "https://pdf.example.com/mcp", "--header", "X-API-KEY:${STIRLING_API_KEY}"],
      "env": { "STIRLING_API_KEY": "<your-key>" }
    }
  }
}
```

## Result files and links

Each result is saved as a temporary file owned by the user and kept for `mcp.resultTtlMinutes`. The model gets its `fileId`, so the next tool call can keep working on the same file without sending it again. Links need `storage.enabled`, `storage.sharing.enabled`, `storage.sharing.linkEnabled` (on by default) and `system.frontendUrl`; without them results still work by `fileId`.

**Private links** (default) look like `https://pdf.example.com/share/<token>?action=download`. Opening one:

1. A signed-out visitor goes straight to the Stirling sign-in page.
2. After sign-in they return to the share page, which runs the action: **Download** saves the file, **Open in Stirling PDF** (`?action=open`) opens it in the editor.

Any signed-in user of your Stirling PDF who has the link can open it until it expires, so treat links like the file itself.

**Public links** (`mcp.downloadLinks: public`) point at `https://pdf.example.com/api/v1/storage/share-links/<token>` and download without signing in until they expire. They are built from `system.backendUrl`, so set it to your public URL.

Expired results are deleted automatically.

## Attachments

When a user attaches a file in ChatGPT, ChatGPT passes Stirling a temporary download URL instead of the file. Stirling downloads it only if:

- the URL is HTTPS,
- the host matches `mcp.fileUrlAllowedHosts`, and
- the host resolves to a public address. Private and internal addresses are always refused.

Entries match the host or any subdomain (`openai.com` also allows `files.openai.com`), and `*` stands for part of one label (`oaisdmntpr*.blob.core.windows.net`). A lone `*` allows any public host. An empty list turns attachments off, and Stirling stops advertising them to ChatGPT. Your firewall must let Stirling reach these hosts over HTTPS.

Refused hosts are logged as `MCP attachment refused: host '...' is not in mcp.fileUrlAllowedHosts`; add the host if it belongs to the chat app.

Claude does not use attachment URLs. Users of either app can send a file with the in-chat file picker, which uploads it straight to Stirling within `mcp.maxRequestBytes`.

## Multiple nodes

Everything above applies to a cluster, plus:

- **Shared storage**: results are stored files, so every node must read the same storage. Use `storage.provider: s3` (or `database`) with `cluster.enabled: true`, the Valkey backplane and `cluster.artifactStore: s3`. A result made on one node is then usable from any other.
- **Load balancer URL**: set `system.frontendUrl` and `system.backendUrl` to the load balancer's public URL, never a node's own address. Otherwise links point at whichever node served the call.
- **No sticky sessions**: `/mcp` keeps no session state, so any node can serve any request.
- **Cleanup**: one node at a time deletes expired results, coordinated through the backplane.
- **Long jobs and rate limits**: job status and each user's rate limit live in the backplane, so polling and limits work from any node.
- Apply the proxy settings above to the load balancer.

## Check your setup

`testing/mcp` in this repository has scripts that check a running server:

```bash
cd testing/mcp && npm ci
# OAuth chain the chat apps walk: 401, metadata, registration, sign-in, token, tool call
MCP_OAUTH_USERNAME=<user> MCP_OAUTH_PASSWORD=<password> python -I oauth_chain.py https://pdf.example.com
# Protocol and tool checks with both official MCP clients (apikey mode or a bearer token)
MCP_URL=https://pdf.example.com MCP_API_KEY=<key> MCP_EXPECT_LINKS=private node run-all.mjs
```

| Symptom | Likely cause |
| --- | --- |
| The app cannot connect or stops after the `401` | `X-Forwarded-Proto` missing, so `resource_metadata` points at `http://`; or the server is not on port 443. |
| Registration fails at the IdP | Dynamic client registration is off, or the chat app's redirect host is not trusted. |
| Sign-in fails after entering credentials | `offline_access` is not grantable for the user, or PKCE `S256` is not supported. |
| Every call returns `401` after sign-in | The token's `aud` lacks `mcp.auth.resourceId`, or `iss` differs from `mcp.auth.issuerUri`. |
| `403` after sign-in | No Stirling account matches `mcp.auth.usernameClaim`. |
| Results have no links | Sharing is off or `system.frontendUrl` is not set. |
| `413` on larger files | `mcp.maxRequestBytes` or the proxy's body limit is too small. |
