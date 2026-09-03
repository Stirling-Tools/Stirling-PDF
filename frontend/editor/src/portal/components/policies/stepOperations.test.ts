import { describe, expect, it } from "vitest";

import {
  STEP_OPERATIONS,
  buildStepParameters,
  customCallUnknownReference,
  emptyOperationValues,
  operationById,
  operationFieldIssue,
  operationFormValid,
  operationsForConnectionType,
  searchOperations,
} from "@portal/components/policies/stepOperations";
import { CREATABLE_CONNECTION_TYPES } from "@portal/components/sources/connectionTypes";

const t = (key: string) => key;

describe("STEP_OPERATIONS", () => {
  it("every operation rides a connection type that exists", () => {
    // An operation whose credential cannot be created is unusable, and the picker would offer
    // inline creation of a type that isn't in the catalogue.
    const ids = new Set(CREATABLE_CONNECTION_TYPES.map((c) => c.id));
    for (const op of STEP_OPERATIONS) {
      expect(ids, `${op.id} -> ${op.connectionTypeId}`).toContain(
        op.connectionTypeId,
      );
    }
  });

  it("has no duplicate ids", () => {
    const ids = STEP_OPERATIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every placeholder in a call is backed by a field the operator can fill", () => {
    // A {{token}} with no matching field would reach the backend unresolved and be sent literally.
    const contextual = /^(document|run|classification|sensitivityLabel)\./;
    for (const op of STEP_OPERATIONS) {
      const blob = [
        op.call.path,
        op.call.bodyTemplate ?? "",
        JSON.stringify(op.call.headers ?? {}),
        JSON.stringify(op.call.fields ?? {}),
      ].join(" ");
      const used = [...blob.matchAll(/\{\{([a-zA-Z0-9_.]+)\}\}/g)].map(
        (m) => m[1],
      );
      const declared = new Set((op.fields ?? []).map((f) => f.key));
      for (const token of used) {
        if (contextual.test(token)) continue; // resolved per document by the backend
        expect(declared, `${op.id} uses {{${token}}}`).toContain(token);
      }
    }
  });
});

describe("buildStepParameters", () => {
  it("substitutes the operator's answers into the path", () => {
    const jira = operationById("jiraAttach")!;
    const params = buildStepParameters(jira, "7", { issueKey: "OPS-42" });

    expect(params.path).toBe("/rest/api/3/issue/OPS-42/attachments");
    expect(params.connectionId).toBe("7");
    expect(params.fileFieldName).toBe("file");
    // The header Jira rejects the upload without.
    expect(JSON.parse(params.headers)).toEqual({
      "X-Atlassian-Token": "no-check",
    });
  });

  it("leaves per-document placeholders for the backend to resolve", () => {
    const splunk = operationById("splunkEvent")!;
    const params = buildStepParameters(splunk, "1", {});

    // These are resolved per document at run time, not here.
    expect(params.bodyTemplate).toContain("{{document.sha256}}");
    expect(params.bodyTemplate).toContain("{{run.policyName}}");
    expect(params.includeFile).toBe("false");
  });

  it("emits a complete parameter set even for a minimal operation", () => {
    const clamav = operationById("clamavScan")!;
    const params = buildStepParameters(clamav, "3", {});

    for (const key of [
      "connectionId",
      "path",
      "method",
      "bodyMode",
      "fileFieldName",
      "responseMode",
      "responseSelect",
      "resultUrlPath",
      "resultUrlHeader",
      "headers",
      "fields",
      "bodyTemplate",
      "includeContext",
      "includeFile",
      "maxRequestBytes",
      "operationId",
      "operationValues",
    ]) {
      expect(params, key).toHaveProperty(key);
    }
    expect(params.operationId).toBe("clamavScan");
  });

  it("remembers the operation and answers so a saved step reopens configured", () => {
    const nextcloud = operationById("nextcloudUpload")!;
    const values = { username: "svc", remotePath: "Processed/x.pdf" };
    const params = buildStepParameters(nextcloud, "9", values);

    expect(params.operationId).toBe("nextcloudUpload");
    expect(JSON.parse(params.operationValues)).toEqual(values);
    expect(params.method).toBe("PUT");
    expect(params.bodyMode).toBe("binary");
  });
});

describe("operation form", () => {
  it("seeds defaults and enforces required fields", () => {
    const elastic = operationById("elasticIndex")!;
    const seeded = emptyOperationValues(elastic);

    expect(seeded.index).toBe("stirling-audit");
    expect(operationFormValid(elastic, seeded)).toBe(true);
    expect(operationFormValid(elastic, { index: "  " })).toBe(false);
  });

  it("an operation with no fields is immediately valid", () => {
    const cloudmersive = operationById("cloudmersiveScan")!;
    expect(operationFormValid(cloudmersive, {})).toBe(true);
  });

  it("refuses a reference the run cannot fill in", () => {
    // {{document.flename}} saves cleanly without this check and then fails every run.
    const discord = operationById("discordNotify")!;
    expect(
      operationFormValid(discord, { message: "{{document.flename}}" }),
    ).toBe(false);
    expect(
      operationFormValid(discord, { message: "{{document.filename}}" }),
    ).toBe(true);
  });

  it("refuses a forward or self step reference when the position is known", () => {
    const discord = operationById("discordNotify")!;
    const values = { message: "see {{steps.2.body.url}}" };
    expect(operationFormValid(discord, values, undefined, 3)).toBe(true);
    expect(operationFormValid(discord, values, undefined, 2)).toBe(false);
    expect(operationFormValid(discord, values, undefined, 1)).toBe(false);
  });

  it("checks the custom call's own path, headers and body template", () => {
    expect(
      customCallUnknownReference({
        path: "/v1/{{document.filename}}",
        headers: '{"X-Doc": "{{document.sha256}}"}',
        bodyTemplate: "",
      }),
    ).toBeNull();
    expect(
      customCallUnknownReference({
        path: "",
        headers: "",
        bodyTemplate: '{"file": "{{document.base46}}"}',
      }),
    ).toBe("document.base46");
  });
});

describe("searchOperations", () => {
  it("matches the job word, not just the product name", () => {
    const hits = searchOperations(STEP_OPERATIONS, "malware", t).map(
      (o) => o.id,
    );
    expect(hits).toContain("cloudmersiveScan");
    expect(hits).toContain("clamavScan");
    expect(hits).not.toContain("jiraAttach");
  });

  it("returns everything for an empty query", () => {
    expect(searchOperations(STEP_OPERATIONS, "  ", t)).toHaveLength(
      STEP_OPERATIONS.length,
    );
  });
});

describe("substituting operator answers into a JSON body", () => {
  it("escapes an answer so a quote does not break the body", () => {
    // The operator types prose, not JSON. An apostrophe is fine; a double quote or a backslash
    // used to land raw inside the serialised template and the backend rejected the whole step
    // with "bodyTemplate must be valid JSON".
    const op = operationById("discordNotify")!;
    const params = buildStepParameters(op, "9", {
      message: 'Tagged the "processed" batch \\ archived',
    });

    const body: unknown = JSON.parse(params.bodyTemplate);
    expect(body).toEqual({
      content: 'Tagged the "processed" batch \\ archived',
    });
  });

  it("leaves the backend's own placeholders for the server pass", () => {
    // {{document.filename}} carries a dot, so the client substituter must not touch it.
    const op = operationById("discordNotify")!;
    const params = buildStepParameters(op, "9", {
      message: "{{run.policyName}} did {{document.filename}}",
    });

    expect(params.bodyTemplate).toContain("{{document.filename}}");
    expect(JSON.parse(params.bodyTemplate)).toEqual({
      content: "{{run.policyName}} did {{document.filename}}",
    });
  });

  it("escapes a quoted answer substituted into the fields map", () => {
    // Mailgun is the entry that actually templates `fields`, and a subject line is exactly the
    // kind of free text an operator puts quotes in.
    const op = operationById("mailgunEmail")!;
    const params = buildStepParameters(op, "3", {
      domain: "mg.example.test",
      to: "ops@example.test",
      from: "bot@example.test",
      subject: 'Re: the "urgent" batch',
    });

    expect(JSON.parse(params.fields)).toMatchObject({
      subject: 'Re: the "urgent" batch',
      to: "ops@example.test",
    });
    // The path is not JSON, so it keeps the plain substitution.
    expect(params.path).toBe("/v3/mg.example.test/messages");
  });
});

describe("the Cloudmersive scan gate", () => {
  it("sends CleanResult as a verdict gate, not a no-op archive selector", () => {
    // The old shape put "CleanResult" in responseSelect, which the backend only reads in replace
    // mode as a ZIP-entry name - so an infected file (HTTP 200, CleanResult:false) sailed through.
    // It must ride requireTrue, which the backend enforces in report mode.
    const params = buildStepParameters(
      operationById("cloudmersiveScan")!,
      "3",
      {},
    );

    expect(params.requireTrue).toBe("CleanResult");
    expect(params.responseSelect).toBe("");
    expect(params.responseMode).toBe("report");
  });

  it("gates the advanced scan too", () => {
    const params = buildStepParameters(
      operationById("cloudmersiveAdvancedScan")!,
      "3",
      {},
    );
    expect(params.requireTrue).toBe("CleanResult");
  });

  it("leaves requireTrue blank for operations that do not gate", () => {
    const params = buildStepParameters(operationById("discordNotify")!, "3", {
      message: "hi",
    });
    expect(params.requireTrue).toBe("");
  });
});

describe("the n8n operations", () => {
  it("covers each of the engine's response behaviours exactly once", () => {
    // A Webhook node can reply, so n8n reaches replace and requireTrue as well as report;
    // collapsed onto notify() the extra three would silently become fire-and-forget.
    const shape = (id: string) => {
      const params = buildStepParameters(operationById(id)!, "1", {
        message: "x",
      });
      return {
        includeFile: params.includeFile,
        responseMode: params.responseMode,
        requireTrue: params.requireTrue,
      };
    };

    expect(shape("n8nNotify")).toEqual({
      includeFile: "false",
      responseMode: "report",
      requireTrue: "",
    });
    expect(shape("n8nSend")).toEqual({
      includeFile: "true",
      responseMode: "report",
      requireTrue: "",
    });
    expect(shape("n8nTransform")).toEqual({
      includeFile: "true",
      responseMode: "replace",
      requireTrue: "",
    });
    expect(shape("n8nGate")).toEqual({
      includeFile: "true",
      responseMode: "report",
      requireTrue: "approved",
    });
  });

  it("sends the facts as fields rather than one sentence to parse", () => {
    const params = buildStepParameters(operationById("n8nNotify")!, "1", {
      message: "done",
    });
    const body = JSON.parse(params.bodyTemplate) as Record<string, unknown>;

    expect(body.message).toBe("done");
    expect(body.document).toEqual({
      filename: "{{document.filename}}",
      extension: "{{document.extension}}",
      contentType: "{{document.contentType}}",
      sizeBytes: "{{document.sizeBytes}}",
      sha256: "{{document.sha256}}",
    });
    expect(body.run).toMatchObject({ policy: "{{run.policyName}}" });
  });

  it("uses no PDF-only placeholder in a fixed body", () => {
    // document.pageCount is added only for PDFs, and the backend throws on a placeholder it cannot
    // resolve - baking it in would fail the step on the first non-PDF that reached it.
    for (const id of ["n8nNotify", "n8nSend", "n8nTransform", "n8nGate"]) {
      const params = buildStepParameters(operationById(id)!, "1", {
        message: "x",
      });
      expect(params.bodyTemplate, id).not.toContain("pageCount");
    }
  });

  it("gives the workflow the run's context beside the file", () => {
    for (const id of ["n8nSend", "n8nTransform", "n8nGate"]) {
      const params = buildStepParameters(operationById(id)!, "1", {});
      expect(params.includeContext, id).toBe("true");
      expect(params.bodyMode, id).toBe("multipart");
    }
  });

  it("leaves every other vendor's context off", () => {
    // includeContext used to be hardcoded false; now that it is per-operation, a vendor with a
    // fixed API would reject the extra part.
    const optedIn = STEP_OPERATIONS.filter(
      (op) => buildStepParameters(op, "1", {}).includeContext === "true",
    ).map((op) => op.id);

    expect(optedIn.sort()).toEqual(["n8nGate", "n8nSend", "n8nTransform"]);
  });
});

describe("substituting an answer into the URL path", () => {
  it("percent-encodes the answer so a slash stays a value, not a new segment", () => {
    // A Jira key like "OPS/1" (or a space) must not add a path segment or reach another endpoint.
    const params = buildStepParameters(operationById("jiraAttach")!, "3", {
      issueKey: "OPS 1/2",
    });

    expect(params.path).toBe("/rest/api/3/issue/OPS%201%2F2/attachments");
    expect(params.path).not.toContain(" ");
  });

  it("leaves the backend's own {{document.*}} placeholders in the path untouched", () => {
    // Mailgun's path carries {{domain}} (an operator field) but backend placeholders would have
    // dots; only the operator field is substituted and encoded here.
    const params = buildStepParameters(operationById("mailgunEmail")!, "3", {
      domain: "mg.acme.com",
    });
    expect(params.path).toBe("/v3/mg.acme.com/messages");
  });

  it("keeps a {{document.*}} reference inside an answer for the backend pass", () => {
    // Encoding the braces would send the reference literally, never resolved - the backend's
    // URL_PATH pass resolves it per document and percent-encodes the value itself.
    const op = operationById("nextcloudUpload")!;
    const params = buildStepParameters(op, "9", {
      username: "svc",
      remotePath: "Processed/{{document.filename}}",
    });
    expect(params.path).toBe(
      "/remote.php/dav/files/svc/Processed/{{document.filename}}",
    );
  });

  it("keeps a path-valued answer's slashes as separators, encoding each segment", () => {
    const op = operationById("nextcloudUpload")!;
    const params = buildStepParameters(op, "9", {
      username: "svc",
      remotePath: "My Reports/2026/x.pdf",
    });
    expect(params.path).toBe(
      "/remote.php/dav/files/svc/My%20Reports/2026/x.pdf",
    );
  });
});

describe("operationsForConnectionType", () => {
  it("lists every task a connection type unlocks, so the (i) can show them", () => {
    const jira = operationsForConnectionType("jira").map((o) => o.id);
    expect(jira).toEqual(
      expect.arrayContaining(["jiraAttach", "jiraComment", "jiraTransition"]),
    );

    const discord = operationsForConnectionType("discord").map((o) => o.id);
    expect(discord).toEqual(
      expect.arrayContaining(["discordNotify", "discordAttach"]),
    );

    const nextcloud = operationsForConnectionType("nextcloud").map((o) => o.id);
    expect(nextcloud).toEqual(
      expect.arrayContaining(["nextcloudUpload", "nextcloudShareLink"]),
    );
  });

  it("returns nothing for a connection type with no policy steps", () => {
    // S3 is a source/destination, not a step operation - so it gets no (i) list.
    expect(operationsForConnectionType("s3")).toEqual([]);
    expect(operationsForConnectionType("does-not-exist")).toEqual([]);
  });
});

describe("per-step size limit", () => {
  it("turns the operator's MB limit into a byte cap for Discord attach", () => {
    const op = operationById("discordAttach")!;
    const params = buildStepParameters(op, "5", {
      ...emptyOperationValues(op),
      maxFileMb: "25",
    });
    expect(params.maxRequestBytes).toBe(String(25 * 1024 * 1024));
  });

  it("caps nothing when the operation declares no size field", () => {
    const params = buildStepParameters(operationById("slackNotify")!, "5", {
      message: "hi",
    });
    expect(params.maxRequestBytes).toBe("0");
  });

  it("treats a blank limit as no cap - the helper text promises exactly that", () => {
    const op = operationById("discordAttach")!;
    const values = { ...emptyOperationValues(op), maxFileMb: "" };
    expect(buildStepParameters(op, "5", values).maxRequestBytes).toBe("0");
    expect(operationFormValid(op, values)).toBe(true);
  });

  it("refuses to save a limit it would otherwise silently drop", () => {
    // "abc" or "-5" coerced to "no cap" is the unsafe direction: the operator set a safeguard
    // and it silently stopped existing. The form must block the save instead.
    const op = operationById("discordAttach")!;
    const field = op.fields!.find((f) => f.key === "maxFileMb")!;
    expect(field.control).toBe("number");
    for (const bad of ["abc", "-5", "0", "25 MB"]) {
      expect(
        operationFormValid(op, { ...emptyOperationValues(op), maxFileMb: bad }),
        bad,
      ).toBe(false);
      expect(operationFieldIssue(field, bad)).toEqual({ kind: "number" });
    }
    expect(
      operationFormValid(op, { ...emptyOperationValues(op), maxFileMb: "25" }),
    ).toBe(true);
  });
});

describe("newly added tasks build the right call", () => {
  it("nextcloudShareLink asks for JSON, sends no file, uses the OCS header", () => {
    const op = operationById("nextcloudShareLink")!;
    const params = buildStepParameters(op, "9", {
      ...emptyOperationValues(op),
      remotePath: "Processed/x.pdf",
    });
    expect(params.includeFile).toBe("false");
    expect(params.path).toContain("format=json");
    expect(params.headers).toContain("OCS-APIRequest");
    // The operator's path lands in the OCS 'path' field alongside the public shareType.
    expect(JSON.parse(params.fields)).toMatchObject({
      path: "Processed/x.pdf",
      shareType: "3",
    });
  });

  it("discordAttach uploads the file under files[0] with a caption", () => {
    const op = operationById("discordAttach")!;
    const params = buildStepParameters(op, "3", {
      ...emptyOperationValues(op),
      message: "done",
    });
    expect(params.bodyMode).toBe("multipart");
    expect(params.fileFieldName).toBe("files[0]");
    expect(params.includeFile).toBe("true");
    // The caption rides in payload_json, Discord's multipart companion field.
    const fields: Record<string, string> = JSON.parse(params.fields);
    expect(JSON.parse(fields.payload_json)).toEqual({ content: "done" });
  });

  it("jiraComment posts an ADF body to the issue's comment endpoint", () => {
    const op = operationById("jiraComment")!;
    const params = buildStepParameters(op, "2", {
      ...emptyOperationValues(op),
      issueKey: "OPS-9",
      message: "processed",
    });
    expect(params.path).toBe("/rest/api/3/issue/OPS-9/comment");
    expect(params.includeFile).toBe("false");
    expect(params.bodyTemplate).toContain("processed");
    // The Atlassian Document Format wrapper survives to the wire.
    expect(params.bodyTemplate).toContain("paragraph");
  });
});
