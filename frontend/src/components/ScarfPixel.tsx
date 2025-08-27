import { useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";

export function ScarfPixel() {
  const location = useLocation();
  const lastUrlSent = useRef<string | null>(null); // helps with React 18 StrictMode in dev

  useEffect(() => {
    // Force reload of the tracking pixel on route change
    const url = 'https://static.scarf.sh/a.png?x-pxid=3c1d68de-8945-4e9f-873f-65320b6fabf7'
               + '&path=' + encodeURIComponent(location.pathname)
               + '&t=' + Date.now();                               // cache-buster


            //    + '&machineType=' + machineType
            //     + '&appVersion=' + appVersion
            //  + '&licenseType=' + license
            //  + '&loginEnabled=' + loginEnabled;
      console.log("ScarfPixel: reload " + location.pathname );

     if (lastUrlSent.current !== url) {
      lastUrlSent.current = url;
      const img = new Image();
      img.referrerPolicy = "no-referrer-when-downgrade"; // optional
      img.src = url;

      console.log("ScarfPixel: Fire to... " + location.pathname , url);
    }
  }, [location.pathname]);

  return null; // Nothing visible in UI
}

