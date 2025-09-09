import React from 'react';
import Hero from './components/Hero';
import Features from './components/Features';
import Templates from './components/Templates';
import Demo from './components/Demo';
import Installation from './components/Installation';
import Footer from './components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      <Hero />
      <Features />
      <Templates />
      <Demo />
      <Installation />
      <Footer />
    </div>
  );
}

export default App;

