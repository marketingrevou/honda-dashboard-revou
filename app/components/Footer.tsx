export default function Footer() {
  return (
    <footer style={{ background: '#333333', color: '#CCCCCC', marginTop: '4rem', borderTop: '3px solid #E62533' }}>
      <div className="max-w-screen-xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://asset.honda-indonesia.com/2023/10/19/logo-side.svg"
            alt="Honda"
            className="h-7"
            style={{ filter: 'brightness(0) invert(1)', opacity: 0.5 }}
          />
          <span style={{ width: '1px', height: '20px', background: '#555', display: 'inline-block' }} />
          <span className="font-mulish" style={{ fontSize: '12px', letterSpacing: '0.2px' }}>
            Digital Content Intelligence Dashboard
          </span>
        </div>
        <span className="font-mulish" style={{ fontSize: '12px', letterSpacing: '0.2px', color: '#555555' }}>
          PT Honda Prospect Motor &nbsp;&middot;&nbsp; &copy; 2026
        </span>
      </div>
    </footer>
  )
}
