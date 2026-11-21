import type { Alert } from '../api/types.ts'

const LABELS: Record<string, string> = { picked_up: 'Picked up' }

// v2 adds more types; unknown ones fall back to the raw type
export const alertLabel = ({ type }: Alert) => LABELS[type] ?? type.replace(/_/g, ' ')
