import React, { useEffect, useState } from "react";
import { Paper, Stack, Text, ScrollArea, Loader, Center, Button, Group } from "@mantine/core";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.js`;

export interface ViewerProps {
  pdfFile: { file: File; url: string } | null;
  setPdfFile: (file: { file: File; url: string } | null) => void;
}

const Viewer: React.FC<ViewerProps> = ({ pdfFile, setPdfFile }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function renderPages() {
      if (!pdfFile || !pdfFile.url) {
        setNumPages(0);
        setPageImages([]);
        return;
      }
      setLoading(true);
      try {
        const pdf = await getDocument(pdfFile.url).promise;
        setNumPages(pdf.numPages);
        const images: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            images.push(canvas.toDataURL());
          }
        }
        if (!cancelled) setPageImages(images);
      } catch {
        if (!cancelled) setPageImages([]);
      }
      if (!cancelled) setLoading(false);
    }
    renderPages();
    return () => { cancelled = true; };
  }, [pdfFile]);

  return (
    <Paper shadow="xs" radius="md" p="md" style={{ height: "100%", minHeight: 400, display: "flex", flexDirection: "column" }}>
      {!pdfFile ? (
        <Center style={{ flex: 1 }}>
          <Stack align="center">
            <Text color="dimmed">No PDF loaded. Click to upload a PDF.</Text>
            <Button
              component="label"
              variant="outline"
              color="blue"
            >
              Choose PDF
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.type === "application/pdf") {
                    const fileUrl = URL.createObjectURL(file);
                    setPdfFile({ file, url: fileUrl });
                  }
                }}
              />
            </Button>
          </Stack>
        </Center>
      ) : loading ? (
        <Center style={{ flex: 1 }}>
          <Loader size="lg" />
        </Center>
      ) : (
        <ScrollArea style={{ flex: 1, height: "100%" }}>
          <Stack gap="xl" align="center">
            {pageImages.length === 0 && (
              <Text color="dimmed">No pages to display.</Text>
            )}
            {pageImages.map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`Page ${idx + 1}`}
                style={{
                  width: "100%",
                  maxWidth: 700,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  borderRadius: 8,
                  background: "#fff"
                }}
              />
            ))}
          </Stack>
        </ScrollArea>
      )}
      {pdfFile && (
        <Group justify="flex-end" mt="md">
          <Button
            variant="light"
            color="red"
            onClick={() => setPdfFile(null)}
          >
            Close PDF
          </Button>
        </Group>
      )}
    </Paper>
  );
};

export default Viewer;
