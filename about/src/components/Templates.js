import React from 'react';

const Templates = () => {
  const templates = [
    {
      name: 'Quality',
      icon: '✨',
      color: 'from-blue-500 to-blue-600',
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
    <section id="templates" className="py-24 bg-gradient-to-r from-primary-800 to-secondary-800 px-8 text-white">
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
              className="relative bg-white/10 backdrop-blur-sm rounded-xl p-6 card-hover"
            >
              <div className="text-center mb-6">
                <div className={`w-16 h-16 bg-gradient-to-r ${template.color} rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl`}>
                  {template.icon}
                </div>
                <h3 className="text-xl font-bold mb-2">
                  {template.name} Review
                </h3>
                <p className="text-sm text-primary-100 mb-4">
                  {template.description}
                </p>
              </div>

              <div className="space-y-4 bg-white/10 backdrop-blur-sm rounded-lg p-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary-100">Best for:</span>
                  <span className="font-medium text-white">{template.bestFor}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary-100">Model:</span>
                  <span className="font-medium text-white">{template.model}</span>
                </div>

                <div className="bg-black/50 rounded-lg p-3 mt-4">
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

