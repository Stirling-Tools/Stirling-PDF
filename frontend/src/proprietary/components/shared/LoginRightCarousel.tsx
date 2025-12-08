import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_PATH } from '@app/constants/app';

type ImageSlide = { src: string; alt?: string; cornerModelUrl?: string; title?: string; subtitle?: string; followMouseTilt?: boolean; tiltMaxDeg?: number }

function LoginRightCarousel({
  imageSlides = [],
  showBackground = true,
  initialSeconds = 5,
  slideSeconds = 8,
}: {
  imageSlides?: ImageSlide[]
  showBackground?: boolean
  initialSeconds?: number
  slideSeconds?: number
}) {
  const totalSlides = imageSlides.length;
  const [index, setIndex] = useState(0);
  const mouse = useRef({ x: 0, y: 0 });

  const durationsMs = useMemo(() => {
    if (imageSlides.length === 0) return [];
    return imageSlides.map((_, i) => (i === 0 ? (initialSeconds ?? slideSeconds) : slideSeconds) * 1000);
  }, [imageSlides, initialSeconds, slideSeconds]);

  useEffect(() => {
    if (totalSlides <= 1) return;
    const timeout = setTimeout(() => {
      setIndex((i) => (i + 1) % totalSlides);
    }, durationsMs[index] ?? slideSeconds * 1000);
    return () => clearTimeout(timeout);
  }, [index, totalSlides, durationsMs, slideSeconds]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  function TiltImage({ src, alt, enabled, maxDeg = 6 }: { src: string; alt?: string; enabled: boolean; maxDeg?: number }) {
    const imgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
      const el = imgRef.current;
      if (!el) return;

      let raf = 0;
      const tick = () => {
        if (enabled) {
          const rotY = (mouse.current.x || 0) * maxDeg;
          const rotX = -(mouse.current.y || 0) * maxDeg;
          el.style.transform = `translateY(-2rem) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
        } else {
          el.style.transform = 'translateY(-2rem)';
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [enabled, maxDeg]);

    return (
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? 'Carousel slide'}
        style={{
          maxWidth: '86%',
          maxHeight: '78%',
          objectFit: 'contain',
          borderRadius: '18px',
          background: 'transparent',
          transform: 'translateY(-2rem)',
          transition: 'transform 80ms ease-out',
          willChange: 'transform',
          transformOrigin: '50% 50%',
        }}
      />
    );
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', width: '100%', height: '100%' }}>
      {showBackground && (
        <img
          src={`${BASE_PATH}/Login/LoginBackgroundPanel.png`}
          alt="Background panel"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {/* Image slides */}
      {imageSlides.map((s, idx) => (
        <div
          key={s.src}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 600ms ease',
            opacity: index === idx ? 1 : 0,
            perspective: '900px',
          }}
        >
          {(s.title || s.subtitle) && (
            <div style={{ position: 'absolute', bottom: 24 + 32, left: 0, right: 0, textAlign: 'center', padding: '0 2rem', width: '100%' }}>
              {s.title && (
                <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', textShadow: '0 2px 6px rgba(0,0,0,0.25)', marginBottom: 6 }}>{s.title}</div>
              )}
              {s.subtitle && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', textShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>{s.subtitle}</div>
              )}
            </div>
          )}
          <TiltImage src={s.src} alt={s.alt} enabled={index === idx && !!s.followMouseTilt} maxDeg={s.tiltMaxDeg ?? 6} />

        </div>
      ))}

      {/* Dot navigation */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 10,
          zIndex: 2,
        }}
      >
        {Array.from({ length: totalSlides }).map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => setIndex(i)}
            style={{
              width: '10px',
              height: '12px',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: i === index ? '#ffffff' : 'rgba(255,255,255,0.5)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              display: 'block',
              flexShrink: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default memo(LoginRightCarousel);
