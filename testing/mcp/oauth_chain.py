"""Walk the OAuth chain ChatGPT and Claude use against a deployed /mcp, then call tools with the token.
The sign-in step drives a Keycloak-style HTML form; standard library only."""

import argparse
import base64
import hashlib
import html
import http.cookiejar
import json
import os
import re
import secrets
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PDF = os.path.join(HERE, "..", "..", "app", "common", "src", "test", "resources", "example.pdf")
DEFAULT_SCOPES = "openid email offline_access mcp.tools.read mcp.tools.write"
MCP_ACCEPT = "application/json, text/event-stream"
EPILOG = """steps: 401 -> protected resource metadata -> AS metadata -> DCR -> sign-in -> code + iss -> token -> MCP calls

env:
  MCP_OAUTH_USERNAME, MCP_OAUTH_PASSWORD  IdP account bound to a Stirling user (required)
  MCP_OAUTH_SCOPES    default "openid email offline_access mcp.tools.read mcp.tools.write"
  MCP_OAUTH_REDIRECT  default http://localhost:8765/cb (the IdP's DCR policy must allow it)"""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Chain:
    def __init__(self, base, insecure):
        self.base = base.rstrip("/")
        if self.base.endswith("/mcp"):
            self.base = self.base[: -len("/mcp")]
        ctx = ssl._create_unverified_context() if insecure else ssl.create_default_context()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ctx),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
            NoRedirect,
        )
        self.failures = 0

    def check(self, label, ok, detail=""):
        self.failures += 0 if ok else 1
        print(("PASS " if ok else "FAIL ") + "[oauth] " + label + (f" - {detail}" if detail else ""))
        return bool(ok)

    def http(self, method, url, data=None, headers=None, form=False):
        body = None
        hdrs = dict(headers or {})
        if data is not None:
            body = urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
            hdrs.setdefault("Content-Type", "application/x-www-form-urlencoded" if form else "application/json")
        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
        try:
            with self.opener.open(req) as res:
                return res.status, res.read(), {k.lower(): v for k, v in res.headers.items()}
        except urllib.error.HTTPError as e:
            return e.code, e.read(), {k.lower(): v for k, v in e.headers.items()}

    def json_get(self, url):
        status, body, _ = self.http("GET", url)
        try:
            return status, json.loads(body)
        except ValueError:
            return status, {}

    def as_metadata(self, issuer):
        """RFC 8414 path-inserted metadata first, then OpenID discovery under the issuer."""
        parsed = urllib.parse.urlparse(issuer)
        candidates = [
            f"{parsed.scheme}://{parsed.netloc}/.well-known/oauth-authorization-server{parsed.path.rstrip('/')}",
            issuer.rstrip("/") + "/.well-known/openid-configuration",
        ]
        for url in candidates:
            status, meta = self.json_get(url)
            if status == 200 and meta.get("issuer"):
                return meta
        return {}

    def mcp(self, token, method, params, rid):
        headers = {"Authorization": "Bearer " + token, "Accept": MCP_ACCEPT}
        frame = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params}
        status, body, _ = self.http("POST", self.base + "/mcp", frame, headers)
        try:
            return status, json.loads(body)
        except ValueError:
            return status, {}


def sign_in(chain, auth_url, username, password):
    """Submit the IdP's sign-in form (and a consent page if one follows); returns the redirect."""
    status, body, headers = chain.http("GET", auth_url)
    match = re.search(r'action="([^"]+)"', body.decode("utf-8", "replace"))
    if not chain.check("authorization endpoint shows a sign-in form", status == 200 and match, f"HTTP {status}"):
        return ""
    form = {"username": username, "password": password, "credentialId": ""}
    status, body, headers = chain.http("POST", html.unescape(match.group(1)), form, form=True)
    if status == 200 and b"consent" in body.lower():
        match = re.search(r'action="([^"]+)"', body.decode("utf-8", "replace"))
        if not match:
            return ""
        status, body, headers = chain.http("POST", html.unescape(match.group(1)), {"accept": "Yes"}, form=True)
        print("     (consent screen accepted)")
    return headers.get("location", "")


def run(args):
    username = os.environ.get("MCP_OAUTH_USERNAME")
    password = os.environ.get("MCP_OAUTH_PASSWORD")
    if not username or not password:
        print("Set MCP_OAUTH_USERNAME and MCP_OAUTH_PASSWORD (an IdP account bound to a Stirling user).")
        return 2
    scopes = os.environ.get("MCP_OAUTH_SCOPES", DEFAULT_SCOPES)
    redirect = os.environ.get("MCP_OAUTH_REDIRECT", "http://localhost:8765/cb")
    chain = Chain(args.base, args.insecure)
    resource = chain.base + "/mcp"

    status, _, headers = chain.http(
        "POST", resource, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, {"Accept": MCP_ACCEPT}
    )
    www = headers.get("www-authenticate", "")
    prm_match = re.search(r'resource_metadata="([^"]+)"', www)
    if not chain.check("unauthenticated /mcp is 401 with resource_metadata", status == 401 and prm_match, www[:160]):
        return 1
    status, prm = chain.json_get(prm_match.group(1))
    chain.check("protected resource metadata names this /mcp", prm.get("resource") == resource, prm.get("resource"))
    chain.check(
        "protected resource metadata lists an authorization server and mcp scopes",
        prm.get("authorization_servers") and "mcp.tools.read" in prm.get("scopes_supported", []),
        json.dumps(prm)[:200],
    )
    if not prm.get("authorization_servers"):
        return 1

    asm = chain.as_metadata(prm["authorization_servers"][0])
    if not chain.check("authorization server metadata found", asm, prm["authorization_servers"][0]):
        return 1
    chain.check("AS supports S256 PKCE", "S256" in asm.get("code_challenge_methods_supported", []))
    chain.check("AS advertises the RFC 9207 iss parameter", asm.get("authorization_response_iss_parameter_supported"))
    chain.check(
        "AS offers DCR or client ID metadata documents",
        asm.get("registration_endpoint") or asm.get("client_id_metadata_document_supported"),
    )
    if not asm.get("registration_endpoint"):
        print("     (no registration_endpoint: this script needs DCR to continue)")
        return 1

    status, body, _ = chain.http(
        "POST",
        asm["registration_endpoint"],
        {
            "client_name": "stirling-mcp-conformance",
            "redirect_uris": [redirect],
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
        },
    )
    reg = json.loads(body) if body else {}
    if not chain.check("dynamic client registration", status == 201 and reg.get("client_id"), f"HTTP {status}"):
        return 1

    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(12)
    query = {
        "response_type": "code",
        "client_id": reg["client_id"],
        "redirect_uri": redirect,
        "scope": scopes,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "resource": resource,
    }
    location = sign_in(chain, asm["authorization_endpoint"] + "?" + urllib.parse.urlencode(query), username, password)
    q = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)
    chain.check("sign-in redirects back with code and state", "code" in q and q.get("state") == [state], location[:160])
    chain.check("redirect carries iss equal to the issuer", q.get("iss") == [asm["issuer"]], str(q.get("iss")))
    if "code" not in q:
        return 1

    status, body, _ = chain.http(
        "POST",
        asm["token_endpoint"],
        {
            "grant_type": "authorization_code",
            "code": q["code"][0],
            "redirect_uri": redirect,
            "client_id": reg["client_id"],
            "code_verifier": verifier,
            "resource": resource,
        },
        form=True,
    )
    tok = json.loads(body) if body else {}
    ok = status == 200 and tok.get("access_token")
    if not chain.check("token exchange", ok, f"HTTP {status}" if ok else f"HTTP {status} {body[:160]!r}"):
        return 1
    claims = json.loads(base64.urlsafe_b64decode(tok["access_token"].split(".")[1] + "=="))
    aud = claims.get("aud") if isinstance(claims.get("aud"), list) else [claims.get("aud")]
    chain.check("access token aud includes this /mcp", resource in aud, f"aud={aud}")
    chain.check("access token iss is the public issuer", claims.get("iss") == asm["issuer"], claims.get("iss"))
    if "offline_access" in scopes.split():
        refresh = tok.get("refresh_token")
        chain.check(
            "offline_access granted a refresh token", refresh, "" if refresh else "grant the offline_access role"
        )

    token = tok["access_token"]
    status, init = chain.mcp(
        token,
        "initialize",
        {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "conformance", "version": "1"}},
        2,
    )
    chain.check("initialize with the bearer token", status == 200 and init.get("result"), f"HTTP {status}")
    status, listed = chain.mcp(token, "tools/list", {}, 3)
    names = [t["name"] for t in listed.get("result", {}).get("tools", [])]
    chain.check("tools/list with the bearer token", "stirling_pages" in names, ",".join(names))
    with open(args.pdf, "rb") as f:
        pdf = base64.b64encode(f.read()).decode()
    arguments = {"operation": "rotate-pdf", "file": pdf, "fileName": "oauth.pdf", "parameters": {"angle": 90}}
    status, called = chain.mcp(token, "tools/call", {"name": "stirling_pages", "arguments": arguments}, 4)
    result = called.get("result", {})
    chain.check("tools/call rotate-pdf succeeds", status == 200 and not result.get("isError"), str(result)[:160])
    link = result.get("structuredContent", {}).get("downloadUrl")
    print(f"     result link: {link or 'none (links off or sharing not configured)'}")

    print("ALL PASS" if chain.failures == 0 else f"{chain.failures} FAILED")
    return 1 if chain.failures else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, epilog=EPILOG, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("base", help="Public base URL of Stirling PDF, e.g. https://pdf.example.com")
    parser.add_argument("--insecure", action="store_true", help="Skip TLS verification (self-signed test certs)")
    parser.add_argument("--pdf", default=DEFAULT_PDF, help="PDF to send through rotate-pdf")
    sys.exit(run(parser.parse_args()))
