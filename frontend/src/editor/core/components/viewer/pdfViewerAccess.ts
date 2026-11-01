import {
  PdfErrorCode,
  PdfTaskHelper,
  TaskStage,
  type PdfDocumentObject,
  type PdfEngine,
} from "@embedpdf/models";
import {
  pdfAccessLifetime,
  rememberUnencryptedPdf,
  ensureLocalPdfAccess,
} from "@editor/services/pdfAccessService";

const sources = new WeakMap<ArrayBuffer, Blob>();

/** Associate the viewer's existing byte read with its exact FileContext source before worker transfer. */
export function bindPdfViewerSource(buffer: ArrayBuffer, source: Blob): void {
  sources.set(buffer, source);
}

/** Resolve access before publishing a document; encrypted sources without cached access need local inspection. */
export function withPdfViewerAccess(engine: PdfEngine<Blob>): PdfEngine<Blob> {
  const open: PdfEngine<Blob>["openDocumentBuffer"] = (file, options) => {
    const source = sources.get(file.content);
    if (!source)
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Security,
        message: "Unable to identify the PDF being opened.",
      });
    const generation = pdfAccessLifetime(source);
    const task = PdfTaskHelper.create<PdfDocumentObject>();
    const cancellation = new AbortController();
    const opening = engine.openDocumentBuffer(file, options);
    const isCurrent = () =>
      task.state.stage === TaskStage.Pending &&
      generation === pdfAccessLifetime(source);
    task.wait(
      () => {},
      (error) => {
        if (error.type === "abort") {
          cancellation.abort();
          opening.abort(error.reason);
        }
      },
    );
    opening.wait(
      (document) => {
        const close = () => {
          engine.closeDocument(document).wait(
            () => {},
            () => {},
          );
        };
        if (!isCurrent()) {
          close();
          task.abort({
            code: PdfErrorCode.Cancelled,
            message: "PDF opening cancelled.",
          });
          return;
        }
        if (
          typeof document.isEncrypted !== "boolean" ||
          !Number.isInteger(document.permissions)
        ) {
          close();
          task.reject({
            code: PdfErrorCode.Security,
            message: "Unable to verify PDF security.",
          });
          return;
        }
        if (!document.isEncrypted) {
          rememberUnencryptedPdf(source, document.pageCount);
          task.resolve(document);
          return;
        }
        void ensureLocalPdfAccess(
          source,
          cancellation.signal,
          options?.password,
        ).then(
          (access) => {
            if (!isCurrent()) {
              close();
              task.abort({
                code: PdfErrorCode.Cancelled,
                message: "PDF opening cancelled.",
              });
            } else if (!access.encrypted) {
              close();
              task.reject({
                code: PdfErrorCode.Security,
                message: "Unable to verify PDF security.",
              });
            } else {
              task.resolve(document);
            }
          },
          () => {
            close();
            task.reject({
              code: PdfErrorCode.Security,
              message:
                "Unable to verify PDF security. Try opening the file again.",
            });
          },
        );
      },
      (error) => task.fail(error),
    );
    return task;
  };
  return new Proxy(engine, {
    get(target, property) {
      if (property === "openDocumentBuffer") return open;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
