import { useState } from 'react'
import { clearToken, hasToken } from './api'
import { PAIRING } from './api/consts.ts'
import PairingScreen from './pages/PairingScreen.tsx'
import Dashboard from './pages/Dashboard.tsx'
// fixture mode code: 482913
export default function App() {
  const [paired, setPaired] = useState(hasToken())

  function onUnpair() {
    clearToken()
    setPaired(false)
  }

  if (PAIRING && !paired) return <PairingScreen onPaired={() => setPaired(true)} />

  return <Dashboard onUnpair={onUnpair} />
}
