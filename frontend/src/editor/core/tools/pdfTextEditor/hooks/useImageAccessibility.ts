import { useCallback, useMemo } from "react";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { RetagBlockCommand } from "@editor/tools/pdfTextEditor/commands/RetagBlockCommand";
import { SetAltTextCommand } from "@editor/tools/pdfTextEditor/commands/SetAltTextCommand";
import { SetDecorativeCommand } from "@editor/tools/pdfTextEditor/commands/SetDecorativeCommand";
import { TagImageCommand } from "@editor/tools/pdfTextEditor/commands/TagImageCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { DescribableType } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  ImageObjectSnapshot,
  SelectionState,
} from "@editor/tools/pdfTextEditor/types";
import {
  imageAccessibility,
  ownedMcid,
  retaggableTag,
  type ImageAccessibility,
} from "@editor/tools/pdfTextEditor/util/imageAccessibility";

/**
 * The accessibility of the selected image: null unless exactly one image and
 * nothing else is selected.
 */
export function useImageAccessibility(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
) {
  const image = useMemo((): ImageObjectSnapshot | null => {
    if (
      selection.imageIds.length !== 1 ||
      selection.runIds.length > 0 ||
      selection.shapeIds.length > 0
    )
      return null;
    return (
      state.pages
        .flatMap((page) => page.images)
        .find((img) => img.id === selection.imageIds[0]) ?? null
    );
  }, [state.pages, selection]);

  const accessibility = useMemo((): ImageAccessibility | null => {
    const doc = store.document;
    return doc && image ? imageAccessibility(doc, image) : null;
  }, [store, image]);

  const setDescription = useCallback(
    (text: string) => {
      const doc = store.document;
      if (!doc || !image || accessibility?.kind !== "describable") return;
      // An emptied field removes the description rather than saving an empty one.
      const command = describeCommand(doc, image, text === "" ? null : text);
      if (command) store.dispatch(command);
    },
    [store, image, accessibility],
  );

  const setType = useCallback(
    (type: DescribableType) => {
      const doc = store.document;
      if (!doc || !image || accessibility?.kind !== "describable") return;
      if (type === accessibility.type) return;
      store.dispatch(typeCommand(doc, image, type));
    },
    [store, image, accessibility],
  );

  const setDecorative = useCallback(
    (decorative: boolean) => {
      const doc = store.document;
      if (!doc || !image) return;
      const command = decorativeCommand(doc, image, decorative);
      if (command) store.dispatch(command);
    },
    [store, image],
  );

  return {
    accessibility,
    setDescription,
    setType,
    setDecorative,
  };
}

function describeCommand(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
  alt: string | null,
): Command | null {
  const mcid = ownedMcid(doc, image);
  if (mcid !== undefined) {
    return new SetAltTextCommand({ pageIndex: image.pageIndex, mcid, alt });
  }
  // Clearing the field of an image no element owns leaves it untagged.
  if (alt === null) return null;
  return new TagImageCommand({
    pageIndex: image.pageIndex,
    imageId: image.id,
    as: "Figure",
    alt,
  });
}

/** An untagged image is given an element of `type`; a tagged one is retagged. */
function typeCommand(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
  type: DescribableType,
): Command {
  const { pageIndex } = image;
  const mcid = ownedMcid(doc, image);
  if (mcid !== undefined)
    return new RetagBlockCommand({ pageIndex, mcid, type });
  return new TagImageCommand({ pageIndex, imageId: image.id, as: type });
}

/**
 * Content the file's elements own changes through its element; anything
 * else is retagged.
 */
function decorativeCommand(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
  decorative: boolean,
): Command | null {
  if (retaggableTag(doc, image)) {
    return new TagImageCommand({
      pageIndex: image.pageIndex,
      imageId: image.id,
      as: decorative ? "artifact" : "Figure",
    });
  }
  if (image.mcid === undefined) return null;
  return new SetDecorativeCommand({
    pageIndex: image.pageIndex,
    mcid: image.mcid,
    decorative,
  });
}
