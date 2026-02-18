export function Atmosphere() {
  // Decorative background only.
  // Keep it lightweight: CSS gradients + a few animated layers, no canvas/three.js.
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base gradient */}
      <div className="absolute inset-0" style={{ background: 'var(--atmo-base)' }} />

      {/* Grain */}
      <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22160%22%20height%3D%22160%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.9%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22/%3E%3C/filter%3E%3Crect%20width%3D%22160%22%20height%3D%22160%22%20filter%3D%22url(%23n)%22%20opacity%3D%220.55%22/%3E%3C/svg%3E')]" />

      {/* Floating 3D-ish blobs */}
      <div className="absolute -left-24 top-24 h-72 w-72 rounded-[48px] blur-xl animate-floatSlow [transform:rotate(12deg)]" style={{ background: 'var(--atmo-blob-a)' }} />
      <div className="absolute right-[-5rem] top-40 h-80 w-80 rounded-full blur-2xl animate-float [transform:rotate(-8deg)]" style={{ background: 'var(--atmo-blob-b)' }} />
      <div className="absolute left-[30%] bottom-[-6rem] h-96 w-96 rounded-[72px] blur-2xl animate-floatSlower [transform:rotate(20deg)]" style={{ background: 'var(--atmo-blob-c)' }} />

      {/* Subtle spotlight */}
      <div className="absolute inset-0" style={{ background: 'var(--atmo-spot)' }} />
    </div>
  );
}
