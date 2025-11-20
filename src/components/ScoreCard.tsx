'use client'

interface ScoreCardProps {
  title: string
  score: number | undefined
  maxScore?: number
  icon?: React.ReactNode
  color?: 'primary' | 'secondary' | 'green' | 'yellow'
  subtitle?: string
}

export default function ScoreCard({
  title,
  score,
  maxScore = 10,
  icon,
  color = 'primary',
  subtitle,
}: ScoreCardProps) {
  const colorClasses = {
    primary: 'from-primary to-primary-dark',
    secondary: 'from-secondary to-secondary-dark',
    green: 'from-green-500 to-green-600',
    yellow: 'from-yellow-500 to-yellow-600',
  }

  const percentage = score !== undefined ? (score / maxScore) * 100 : 0

  return (
    <div className="relative bg-dark-light rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all group">
      {/* Background Glow */}
      <div className={`absolute inset-0 bg-gradient-to-br ${colorClasses[color]} opacity-0 group-hover:opacity-10 rounded-xl transition-opacity blur-xl`} />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {icon && (
              <div className={`p-2 rounded-lg bg-gradient-to-br ${colorClasses[color]}`}>
                {icon}
              </div>
            )}
            <div>
              <h3 className="text-sm font-medium text-gray-400">{title}</h3>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <span className="text-4xl font-bold text-white">
              {score !== undefined ? score.toFixed(2) : '—'}
            </span>
            <span className="text-lg text-gray-400">/ {maxScore}</span>
          </div>

          {/* Progress Bar */}
          <div className="relative h-2 bg-dark rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colorClasses[color]} transition-all duration-500 rounded-full`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

