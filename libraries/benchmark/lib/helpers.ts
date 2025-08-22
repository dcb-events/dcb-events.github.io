import { Query, QueryItem } from "./types"

export function generateStrings(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
}

export function either<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

export function some<T>(array: T[], n: number): T[] {
  return [...array].sort(() => Math.random() - 0.5).slice(0, n)
}

export function between(range: { min: number; max: number }): number {
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min
}

export const QueryBuilder = {
  all(): Query {
    return { items: [] }
  },
  fromItems(items: QueryItem[]): Query {
    return { items }
  },
}