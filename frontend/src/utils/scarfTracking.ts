let lastFiredPathname: string | null = null;
let lastFiredTime = 0;

/**
 * Fire scarf pixel for analytics tracking
 * Only fires if pathname is different from last call or enough time has passed
 */
export function firePixel(pathname: string): void {
  const now = Date.now();

  // Only fire if pathname changed or it's been at least 1 second since last fire
  if (pathname === lastFiredPathname && now - lastFiredTime < 250) {
    return;
  }

  lastFiredPathname = pathname;
  lastFiredTime = now;

  const url = 'https://static.scarf.sh/a.png?x-pxid=3c1d68de-8945-4e9f-873f-65320b6fabf7'
             + '&path=' + encodeURIComponent(pathname)

  const img = new Image();
  img.referrerPolicy = "no-referrer-when-downgrade";
  img.src = url;
}

