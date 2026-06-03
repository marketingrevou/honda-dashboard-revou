'use client'

interface AccountsChipProps {
  count: number
  accounts: string[]
}

export default function AccountsChip({ count, accounts }: AccountsChipProps) {
  return (
    <span className="meta-chip text-white accounts-chip" style={{ background: '#E62533', cursor: 'default' }}>
      {count} Accounts
      <span className="accounts-tooltip">{accounts.join(' · ')}</span>
    </span>
  )
}
