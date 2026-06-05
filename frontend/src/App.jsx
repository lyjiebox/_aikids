import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Home from './pages/Home';
import Create from './pages/Create';
import Play from './pages/Play';
import Gallery from './pages/Gallery';
import Settings from './pages/Settings';
import Navbar from './components/Navbar';

function App() {
  return (
    <AppProvider>
      <Router>
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<Create />} />
            <Route path="/play/:workId" element={<Play />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
          <Navbar />
        </div>
      </Router>
    </AppProvider>
  );
}

export default App;
