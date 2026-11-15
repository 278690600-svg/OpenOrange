import Papa from 'papaparse'

export interface ColumnStats {
  column: string
  type: 'numeric' | 'categorical' | 'datetime' | 'boolean'
  count: number
  nulls: number
  unique: number
  // Numeric stats
  mean?: number
  median?: number
  mode?: string
  stdDev?: number
  min?: number
  max?: number
  q1?: number
  q3?: number
  sum?: number
  // Categorical stats
  topValues?: Array<{ value: string; count: number; percentage: number }>
}

export interface TimeSeriesPoint {
  date: string
  values: Record<string, number>
}

export interface TimeSeriesAnalysis {
  column: string
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile'
  points: TimeSeriesPoint[]
  growthRate?: number
  movingAverage?: number[]
}

export interface AnalysisResult {
  columnCount: number
  rowCount: number
  columns: ColumnStats[]
  timeSeries?: TimeSeriesAnalysis[]
  correlations?: Array<{ colA: string; colB: string; coefficient: number }>
}

export interface DashboardWidget {
  id: string
  type: 'bar' | 'line' | 'pie' | 'area' | 'stats'
  title: string
  xColumn?: string
  yColumns?: string[]
  position?: { x: number; y: number; w: number; h: number }
}

export interface Dashboard {
  id: string
  title: string
  dataName: string
  columns: string[]
  data: Record<string, unknown>[]
  widgets: DashboardWidget[]
  createdAt: string
  updatedAt: string
}

function isNumeric(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false
  const num = Number(value)
  return !isNaN(num) && isFinite(num)
}

function isDate(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const date = new Date(value)
  return !isNaN(date.getTime()) && value.length > 4 && value.includes('-') || value.includes('/')
}

function parseDate(value: string): Date {
  return new Date(value)
}

export function parseData(content: string, format: 'csv' | 'json'): { columns: string[]; data: Record<string, unknown>[] } {
  if (format === 'csv') {
    const result = Papa.parse(content, { header: true, skipEmptyLines: true })
    return {
      columns: result.meta.fields || [],
      data: result.data as Record<string, unknown>[],
    }
  }

  const parsed = JSON.parse(content)
  const dataArray = Array.isArray(parsed) ? parsed : parsed.data || parsed.results || [parsed]
  const columns = dataArray.length > 0 ? Object.keys(dataArray[0]) : []
  return { columns, data: dataArray as Record<string, unknown>[] }
}

export function detectColumnType(data: Record<string, unknown>[], column: string): 'numeric' | 'categorical' | 'datetime' | 'boolean' {
  const sample = data.slice(0, 100).map(row => row[column]).filter(v => v !== null && v !== undefined && v !== '')
  if (sample.length === 0) return 'categorical'

  const numericCount = sample.filter(v => isNumeric(v)).length
  const dateCount = sample.filter(v => isDate(v)).length
  const boolCount = sample.filter(v => typeof v === 'boolean' || v === 'true' || v === 'false' || v === 1 || v === 0).length

  if (numericCount / sample.length > 0.7) return 'numeric'
  if (dateCount / sample.length > 0.7) return 'datetime'
  if (boolCount / sample.length > 0.7) return 'boolean'
  return 'categorical'
}

export function computeStats(data: Record<string, unknown>[], columns: string[]): ColumnStats[] {
  return columns.map(column => {
    const values = data.map(row => row[column])
    const nonNulls = values.filter(v => v !== null && v !== undefined && v !== '')
    const nulls = values.length - nonNulls.length
    const unique = new Set(nonNulls.map(String)).size
    const type = detectColumnType(data, column)

    const base: ColumnStats = {
      column,
      type,
      count: nonNulls.length,
      nulls,
      unique,
    }

    if (type === 'numeric') {
      const nums = nonNulls.map(v => Number(v)).sort((a, b) => a - b)
      if (nums.length === 0) return base

      const sum = nums.reduce((a, b) => a + b, 0)
      const mean = sum / nums.length
      const median = nums.length % 2 === 0
        ? (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2
        : nums[Math.floor(nums.length / 2)]
      const variance = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / nums.length
      const stdDev = Math.sqrt(variance)

      // Mode
      const freq: Record<string, number> = {}
      nums.forEach(v => { freq[String(v)] = (freq[String(v)] || 0) + 1 })
      const mode = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0]

      const q1Idx = Math.floor(nums.length * 0.25)
      const q3Idx = Math.floor(nums.length * 0.75)

      return {
        ...base,
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        mode,
        stdDev: Math.round(stdDev * 100) / 100,
        min: nums[0],
        max: nums[nums.length - 1],
        q1: nums[q1Idx],
        q3: nums[q3Idx],
        sum: Math.round(sum * 100) / 100,
      }
    }

    if (type === 'categorical' || type === 'boolean') {
      const freq: Record<string, number> = {}
      nonNulls.forEach(v => {
        const str = String(v)
        freq[str] = (freq[str] || 0) + 1
      })

      const topValues = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({
          value,
          count,
          percentage: Math.round((count / nonNulls.length) * 10000) / 100,
        }))

      const mode = topValues[0]?.value

      return {
        ...base,
        mode,
        topValues,
      }
    }

    return base
  })
}

export function analyzeTimeSeries(data: Record<string, unknown>[], dateColumn: string, valueColumns: string[]): TimeSeriesAnalysis[] {
  const sorted = [...data].sort((a, b) => {
    const dA = parseDate(String(a[dateColumn]))
    const dB = parseDate(String(b[dateColumn]))
    return dA.getTime() - dB.getTime()
  })

  return valueColumns.map(valueCol => {
    const points: TimeSeriesPoint[] = sorted
      .filter(row => isDate(row[dateColumn]) && isNumeric(row[valueCol]))
      .map(row => ({
        date: String(row[dateColumn]).split('T')[0],
        values: { [valueCol]: Number(row[valueCol]) },
      }))

    if (points.length < 2) {
      return { column: valueCol, trend: 'stable' as const, points }
    }

    // Simple linear regression for trend
    const values = points.map(p => p.values[valueCol])
    const n = values.length
    const xMean = (n - 1) / 2
    const yMean = values.reduce((a, b) => a + b, 0) / n
    const numerator = values.reduce((acc, y, i) => acc + (i - xMean) * (y - yMean), 0)
    const denominator = values.reduce((acc, _, i) => acc + (i - xMean) ** 2, 0)
    const slope = denominator !== 0 ? numerator / denominator : 0

    const growthRate = yMean !== 0 ? (slope / yMean) * 100 : 0

    // Moving average (window of 7 or n/3)
    const window = Math.min(7, Math.max(2, Math.floor(n / 3)))
    const movingAverage: number[] = []
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - window + 1)
      const slice = values.slice(start, i + 1)
      movingAverage.push(slice.reduce((a, b) => a + b, 0) / slice.length)
    }

    // Classify trend
    const stdDev = Math.sqrt(values.reduce((acc, v) => acc + (v - yMean) ** 2, 0) / n)
    const cv = yMean !== 0 ? stdDev / Math.abs(yMean) : 0
    const normalizedSlope = yMean !== 0 ? Math.abs(slope) / Math.abs(yMean) : 0

    let trend: 'increasing' | 'decreasing' | 'stable' | 'volatile'
    if (cv > 0.3) {
      trend = 'volatile'
    } else if (normalizedSlope < 0.01) {
      trend = 'stable'
    } else if (slope > 0) {
      trend = 'increasing'
    } else {
      trend = 'decreasing'
    }

    return { column: valueCol, trend, points, growthRate: Math.round(growthRate * 100) / 100, movingAverage }
  })
}

export function computeCorrelations(data: Record<string, unknown>[], numericColumns: string[]): Array<{ colA: string; colB: string; coefficient: number }> {
  const correlations: Array<{ colA: string; colB: string; coefficient: number }> = []

  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      const colA = numericColumns[i]
      const colB = numericColumns[j]

      const pairs = data
        .map(row => [Number(row[colA]), Number(row[colB])])
        .filter(([a, b]) => !isNaN(a) && !isNaN(b))

      if (pairs.length < 3) continue

      const n = pairs.length
      const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / n
      const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / n

      let cov = 0
      let stdA = 0
      let stdB = 0
      for (const [a, b] of pairs) {
        cov += (a - meanA) * (b - meanB)
        stdA += (a - meanA) ** 2
        stdB += (b - meanB) ** 2
      }

      const denominator = Math.sqrt(stdA * stdB)
      const coefficient = denominator !== 0 ? cov / denominator : 0

      correlations.push({ colA, colB, coefficient: Math.round(coefficient * 1000) / 1000 })
    }
  }

  return correlations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient))
}

export function analyzeData(data: Record<string, unknown>[], columns: string[]): AnalysisResult {
  const columnStats = computeStats(data, columns)
  const numericColumns = columnStats.filter(s => s.type === 'numeric').map(s => s.column)
  const dateColumns = columnStats.filter(s => s.type === 'datetime').map(s => s.column)

  let timeSeries: TimeSeriesAnalysis[] | undefined
  if (dateColumns.length > 0 && numericColumns.length > 0) {
    timeSeries = analyzeTimeSeries(data, dateColumns[0], numericColumns)
  }

  const correlations = numericColumns.length >= 2
    ? computeCorrelations(data, numericColumns)
    : undefined

  return {
    columnCount: columns.length,
    rowCount: data.length,
    columns: columnStats,
    timeSeries,
    correlations,
  }
}
