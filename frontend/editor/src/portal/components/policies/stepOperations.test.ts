import { describe, expect, it } from "vitest";

import {
  STEP_OPERATIONS,
  buildStepParameters,
  emptyOperationValues,
  operationById,
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

  it("treats a blank or non-numeric limit as no cap", () => {
    const op = operationById("discordAttach")!;
    expect(
      buildStepParameters(op, "5", {
        ...emptyOperationValues(op),
        maxFileMb: "",
      }).maxRequestBytes,
    ).toBe("0");
    expect(
      buildStepParameters(op, "5", {
        ...emptyOperationValues(op),
        maxFileMb: "abc",
      }).maxRequestBytes,
    ).toBe("0");
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
