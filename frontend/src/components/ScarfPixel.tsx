import { useEffect, useRef } from "react";
import { useNavigationState } from "../contexts/NavigationContext";

export function ScarfPixel() {
  const { workbench, selectedTool } = useNavigationState();
  const lastUrlSent = useRef<string | null>(null); // helps with React 18 StrictMode in dev

  useEffect(() => {
    // Get current pathname from browser location
    const pathname = window.location.pathname;
    
    const url = 'https://static.scarf.sh/a.png?x-pxid=3c1d68de-8945-4e9f-873f-65320b6fabf7'
               + '&path=' + encodeURIComponent(pathname)
               + '&t=' + Date.now(); // cache-buster

    console.log("ScarfPixel: Navigation change", { workbench, selectedTool, pathname });

    if (lastUrlSent.current !== url) {
      lastUrlSent.current = url;
      const img = new Image();
      img.referrerPolicy = "no-referrer-when-downgrade"; // optional
      img.src = url;

      console.log("ScarfPixel: Fire to... " + pathname, url);
    }
  }, [workbench, selectedTool]); // Fire when navigation state changes

  return null; // Nothing visible in UI
}

