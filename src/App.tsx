import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Home from './pages/Home'
import ComparisonDashboard from './pages/ComparisonDashboard'
import ComparisonManual from './pages/ComparisonManual'
import ComparisonElec from './pages/ComparisonElec'
import ComparisonEau from './pages/ComparisonEau'
import Parametres from './pages/Parametres'
import ElectricityManuel from './pages/ElectricityManuel'
import EauManuel from './pages/EauManuel'
import EauWattnow from './pages/EauWattnow'
import ManualDeviceList from './pages/ManualDeviceList'
import ManualEntryForm from './pages/ManualEntryForm'
import DataExplorer from './pages/DataExplorer'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* PUBLIC — no auth needed */}
        <Route path="/" element={<Login />} />
        
        {/* PROTECTED — AppLayout checks auth inside */}
        <Route element={<AppLayout />}>
          <Route path="/home" element={<Navigate to="/home/electricity" replace />} />
          <Route path="/home/:type" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/comparison" element={<ComparisonDashboard />} />
          <Route path="/comparison-manual" element={<ComparisonManual />} />
          <Route path="/comparison/electricity" element={<ComparisonElec />} />
          <Route path="/comparison/eau" element={<ComparisonEau />} />
          
          {/* Électricité */}
          <Route path="/electricity/manuel" element={<ElectricityManuel />} />
          
          {/* Eau */}
          <Route path="/eau/manuel" element={<EauManuel />} />
          <Route path="/eau/wattnow" element={<EauWattnow />} />
          
          <Route path="/explorer" element={<DataExplorer />} />
          <Route path="/manual-list/:type" element={<ManualDeviceList />} />
          <Route path="/manual-entry/:deviceId" element={<ManualEntryForm />} />
          
          <Route path="/parametres" element={<Parametres />} />
        </Route>
        
        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
