export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({length: cols}).map((_, i) => (
        <td key={i} className="p-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse" style={{width: `${60 + (i * 15) % 40}%`}}/>
        </td>
      ))}
    </tr>
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/3 mb-3"/>
      <div className="h-7 bg-gray-200 rounded w-1/2 mb-2"/>
      <div className="h-3 bg-gray-200 rounded w-1/4"/>
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="h-10 bg-gray-50 border-b border-gray-100"/>
      <table className="w-full">
        <tbody>
          {Array.from({length: rows}).map((_, i) => (
            <SkeletonRow key={i} cols={cols}/>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function SkeletonPage() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-8 bg-gray-200 rounded w-48"/>
        <div className="h-9 bg-gray-200 rounded w-24"/>
      </div>
      <div className="h-10 bg-gray-200 rounded w-full"/>
      <SkeletonTable rows={6} cols={4}/>
    </div>
  )
}
