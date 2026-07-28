import React from 'react';

const Features = () => {
  const features = [
    {
      icon: '🔒',
      title: 'Structured Output',
      description: 'Every model returns findings against one shared schema.',
      highlights: [
        'Severity & category',
        'Line-level findings',
        'Same shape per model',
        'Machine-readable JSON'
      ]
    },
    {
      icon: '🤖',
      title: 'Multi-Model AI',
      description: 'Claude, Gemini, and smart fallbacks for optimal performance.',
      highlights: [
        'Claude Sonnet 5 & Haiku 4.5',
        'Gemini Flash',
        'Auto fallbacks',
        'Token tracking'
      ]
    },
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description: 'Smart caching and parallel processing for large codebases.',
      highlights: [
        'Smart caching',
        'Parallel processing',
        'Incremental reviews',
        'Resume sessions'
      ]
    },
    {
      icon: '🛠',
      title: 'Developer Tools',
      description: 'Interactive mode, watch mode, and professional features.',
      highlights: [
        'Interactive selection',
        'Watch mode',
        'Session management',
        'Custom config'
      ]
    }
  ];

  return (
    <section id="features" className="relative py-24 seam-top striped">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Features
            </h2>
            <span className="rule flex-1"></span>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group panel-blue p-7 card-hover relative"
            >
              <div className="flex items-start space-x-4">
                <div className="feature-icon bg-white/5 text-green-400 group-hover:bg-green-400/15 transition-colors duration-300">
                  {feature.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bungee tracking-tight text-white mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-zinc-400 mb-4 leading-relaxed text-lg">
                    {feature.description}
                  </p>
                  <ul className="space-y-2">
                    {feature.highlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-center text-zinc-300">
                        <svg className="w-4 h-4 text-green-400 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;

