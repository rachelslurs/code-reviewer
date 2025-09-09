import React from 'react';

const Features = () => {
  const features = [
    {
      icon: '🤖',
      title: 'Multi-Model AI',
      description: 'Claude, Gemini, and smart fallbacks for optimal performance.',
      highlights: [
        'Claude Sonnet & Haiku',
        'Gemini Pro & Flash',
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
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Code Reviewer
            <span className="gradient-text"> Features</span>
          </h2>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group bg-gradient-to-r from-primary-50 to-secondary-50  rounded-2xl p-8 card-hover border border-gray-100"
            >
              <div className="flex items-start space-x-4">
                <div className="feature-icon bg-black/10 text-secondary-600 group-hover:bg-secondary-200 transition-colors duration-300">
                  {feature.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 mb-4 leading-relaxed">
                    {feature.description}
                  </p>
                  <ul className="space-y-2">
                    {feature.highlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-center text-sm text-gray-700">
                        <svg className="w-4 h-4 text-primary-700 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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

