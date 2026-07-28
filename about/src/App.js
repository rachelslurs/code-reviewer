import React from 'react';
import Hero from './components/Hero';
import Features from './components/Features';
import Templates from './components/Templates';
import Demo from './components/Demo';
import Installation from './components/Installation';
import Footer from './components/Footer';

function App() {
  return (
    <div className="min-h-screen">
      <main>
        <Hero />
        <Features />
        <Demo />
        <Installation />
        <Templates />
      </main>
      <Footer />
    </div>
  );
}

export default App;

