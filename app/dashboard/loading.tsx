export default function DashboardLoading() {
  return (
    <>
      <div className="bg-white" style={{ borderTop: '4px solid #E62533', borderBottom: '1px solid #E5E7EB', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://asset.honda-indonesia.com/2023/10/19/logo-side.svg" alt="Honda" style={{ height: '36px', flexShrink: 0 }} />
          <div className="hidden sm:block flex-shrink-0" style={{ width: '1px', height: '32px', background: '#E5E7EB' }} />
          <div className="flex-1">
            <div className="animate-pulse rounded" style={{ height: '14px', width: '260px', background: '#E5E7EB' }} />
          </div>
          <div className="flex items-center gap-2">
            {[80, 96, 64].map((w, i) => (
              <div key={i} className="animate-pulse rounded-full" style={{ height: '24px', width: `${w}px`, background: '#E5E7EB' }} />
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-6 pb-16">
        <div style={{ paddingTop: '24px', paddingBottom: '24px' }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-white rounded-lg p-4" style={{ border: '1px solid #E5E7EB' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="rounded-full flex-shrink-0" style={{ width: '32px', height: '32px', background: '#E5E7EB' }} />
                  <div className="rounded flex-1" style={{ height: '12px', background: '#E5E7EB' }} />
                </div>
                <div className="rounded mb-2" style={{ height: '10px', width: '75%', background: '#F0F0F0' }} />
                <div className="rounded" style={{ height: '10px', width: '50%', background: '#F0F0F0' }} />
              </div>
            ))}
          </div>
        </div>

        <div className="animate-pulse bg-white rounded-lg p-6 mb-6" style={{ border: '1px solid #E5E7EB' }}>
          <div className="rounded mb-4" style={{ height: '14px', width: '160px', background: '#E5E7EB' }} />
          <div className="rounded" style={{ height: '140px', background: '#F7F7F7' }} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
              <div style={{ aspectRatio: '1/1', background: '#F0F0F0' }} />
              <div className="p-3">
                <div className="rounded mb-2" style={{ height: '10px', width: '80%', background: '#E5E7EB' }} />
                <div className="rounded" style={{ height: '10px', width: '55%', background: '#F0F0F0' }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
