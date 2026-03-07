import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import ContainersPage from './pages/ContainersPage'
import ImagesPage from './pages/ImagesPage'
import NetworksPage from './pages/NetworksPage'
import VolumesPage from './pages/VolumesPage'
import ChatPage from './pages/ChatPage'
import DeployPage from './pages/DeployPage'
import RollbackPage from './pages/RollbackPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1c1f2a',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.08)',
            fontFamily: "'Space Grotesk', sans-serif",
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#0f1117' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#0f1117' } },
        }}
      />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="containers" element={<ContainersPage />} />
          <Route path="images" element={<ImagesPage />} />
          <Route path="networks" element={<NetworksPage />} />
          <Route path="volumes" element={<VolumesPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="deploy" element={<DeployPage />} />
          <Route path="rollback" element={<RollbackPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </>
  )
}
