import React from 'react';

const Templates = () => {
  const templates = [
    {
      name: 'Quality',
      icon: '✨',
      color: 'from-blue-500  to-blue-600',
      description: 'Code organization, naming, duplication, complexity, error handling',
      model: 'Gemini Flash',
      command: 'code-review --template quality ./src',
      bestFor: 'Daily code review, maintainability'
    },
    {
      name: 'Security',
      icon: '🔒',
      color: 'from-red-500 to-red-600',
      description: 'Vulnerabilities, data validation, injection attacks, authentication issues',
      model: 'Claude Sonnet',
      command: 'code-review --template security ./src',
      bestFor: 'Production deployments, security audits'
    },
    {
      name: 'Performance',
      icon: '⚡',
      color: 'from-yellow-500 to-yellow-600',
      description: 'Bundle size optimization, async patterns, memory usage',
      model: 'Gemini Flash',
      command: 'code-review --template performance ./src',
      bestFor: 'Optimization, bundle size reduction'
    },
    {
      name: 'TypeScript',
      icon: '📘',
      color: 'from-indigo-500 to-indigo-600',
      description: 'Type safety, strict mode compliance, generic usage',
      model: 'Gemini Flash',
      command: 'code-review --template typescript ./src',
      bestFor: 'Type safety, migration to strict mode'
    },
    {
      name: 'Combined',
      icon: '🎯',
      color: 'from-purple-500 to-purple-600',
      description: 'All review types in one comprehensive analysis',
      model: 'Claude Sonnet',
      command: 'code-review --template combined ./src',
      bestFor: 'Comprehensive analysis in single pass',
      recommended: true
    }
  ];

  return (
    <section id="templates" className="relative py-24 bg-gradient-to-r from-primary-800 to-secondary-800 px-8 text-white">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2040%2040%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.2%22%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-75"></div>
     
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-primary-50 mb-6">
            Review Templates
          </h2>
          <p className="text-xl text-primary-100 max-w-3xl mx-auto">
            Specialized templates for different aspects of code quality, 
            each optimized for specific AI models and use cases.
          </p>
        </div>

        {/* First 4 Templates - 2x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {templates.slice(0, 4).map((template, index) => (
            <div
              key={index}
              className="relative bg-white/10 backdrop-blur-sm rounded-xl p-6 card-hover group"
            >
              <div className="text-center mb-6">
                <div className={`w-16 h-16 bg-gradient-to-r from-black/10 to-black/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl opacity-70 group-hover:opacity-100 transition-opacity duration-300`}>
                  {template.icon}
                </div>
                <h3 className="text-lg text-white font-bungee tracking-normal mb-2 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                  {template.name} Review
                </h3>
                <p className="text-primary-100 mb-4">
                  {template.description}
                </p>
              </div>

              <div className="space-y-4 bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <span className="text-primary-100">Best for:</span>
                  <span className="font-semibold text-white">{template.bestFor}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-primary-100">Model:</span>
                  <span className="font-semibold text-white">{template.model}</span>
                </div>

                <div className="bg-black/80 rounded-lg p-3 mt-4">
                  <code className="text-green-400 text-xs font-mono">
                    {template.command}
                  </code>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Templates;

