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
    <section id="templates" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            Comprehensive
            <span className="gradient-text"> Review Templates</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Specialized templates for different aspects of code quality, 
            each optimized for specific AI models and use cases.
          </p>
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template, index) => (
            <div
              key={index}
              className={`relative bg-white rounded-2xl p-6 card-hover border-2 ${
                template.recommended ? 'border-primary-200 ring-2 ring-primary-100' : 'border-gray-100'
              }`}
            >
              {template.recommended && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-primary-500 to-accent-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    ⭐ Recommended
                  </span>
                </div>
              )}
              
              <div className="text-center mb-6">
                <div className={`w-16 h-16 bg-gradient-to-r ${template.color} rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl`}>
                  {template.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {template.name} Review
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {template.description}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Best for:</span>
                  <span className="font-medium text-gray-900">{template.bestFor}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Model:</span>
                  <span className="font-medium text-gray-900">{template.model}</span>
                </div>

                <div className="bg-gray-900 rounded-lg p-3 mt-4">
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

