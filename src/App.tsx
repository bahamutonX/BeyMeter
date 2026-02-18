import './App.css'
import { AppShell } from './app/AppShell'
import { RawLogPage } from './app/RawLogPage'

function App() {
  if (window.location.pathname.startsWith('/rawlog')) {
    return <RawLogPage />
  }
  return <AppShell />
}

export default App
