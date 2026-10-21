import { HashRouter } from 'react-router'
import { Toaster } from '@/components/ui/toast'
import { AppLayout } from '@/layout/app-layout'

function App() {
  return (
    <Toaster>
      <HashRouter>
        <AppLayout />
      </HashRouter>
    </Toaster>
  )
}

export default App
