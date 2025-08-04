import { TooltipContent } from './types';

export const compressTips: TooltipContent = {
  header: {
    title: "Settings Overview"
  },
  tips: [
    {
      title: "Compression Method",
      description: "Compression is an easy way to reduce your file size. Pick <strong>File Size</strong> to enter a target size and have us adjust quality for you. Pick <strong>Quality</strong> to set compression strength manually."
    },
    {
      title: "Quality Adjustment",
      description: "Drag the slider to adjust the compression strength. <strong>Lower values (1-3)</strong> preserve quality but result in larger files. <strong>Higher values (7-9)</strong> shrink the file more but reduce image clarity.",
      bullets: [
        "Lower values preserve quality",
        "Higher values reduce file size"
      ]
    },
    {
      title: "Grayscale",
      description: "Select this option to convert all images to black and white, which can significantly reduce file size especially for scanned PDFs or image-heavy documents."
    }
  ]
}; 