import type { Alert } from '../api/types.ts'

const LABELS: Record<string, string> = { picked_up: 'Picked up' }


export const alertLabel = ({ type }: Alert) => LABELS[type] ?? type.replace(/_/g, ' ')
