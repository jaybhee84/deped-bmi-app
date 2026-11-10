import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ResetPassword from './components/ResetPassword.jsx'
import { PrintPreviewProvider } from './components/PrintPreview/PrintPreviewContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrintPreviewProvider>
      {window.location.pathname === '/reset-password' ? <ResetPassword /> : <App />}
    </PrintPreviewProvider>
  </StrictMode>,
)
