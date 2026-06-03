import AccountsChip from './AccountsChip'

interface HeaderProps {
  dateRange: string
  accountCount: number
  accounts: string[]
  postCount: number
}

export default function Header({ dateRange, accountCount, accounts, postCount }: HeaderProps) {
  return (
    <header className="bg-white" style={{ borderTop: '4px solid #E62533', borderBottom: '1px solid #E5E7EB' }}>
      <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-4 flex-wrap lg:flex-nowrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://asset.honda-indonesia.com/2023/10/19/logo-side.svg"
          alt="Honda"
          className="h-9 flex-shrink-0"
        />
        <div style={{ width: '1px', height: '32px', background: '#E5E7EB', flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <h1 className="font-roboto font-bold truncate" style={{ fontSize: '15px', lineHeight: '1.3', color: '#111827' }}>
            Digital Content Intelligence Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="meta-chip" style={{ background: '#F0F0F0', color: '#555555' }}>
            {dateRange}
          </span>
          <AccountsChip count={accountCount} accounts={accounts} />
          <span className="meta-chip text-white" style={{ background: '#333333' }}>
            {postCount} Posts
          </span>
        </div>
      </div>
    </header>
  )
}
