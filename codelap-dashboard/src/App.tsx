import { useState } from 'react'
import { hasToken } from './api'
import PairingScreen from './PairingScreen'

export default function App() {
  const [paired, setPaired] = useState(hasToken())

  if (!paired) return <PairingScreen onPaired={() => setPaired(true)} />

  return <div>Dashboard goes here</div>
}