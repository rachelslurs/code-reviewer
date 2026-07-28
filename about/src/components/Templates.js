import React from 'react';

const Templates = () => {
  const templates = [
    {
      name: 'Quality',
      icon: '✨',
      color: 'from-blue-500  to-blue-600',
      description: 'Code organization, naming, duplication, complexity, error handling',
      model: 'Gemini Flash Lite',
      command: 'code-review --template quality ./src',
      bestFor: 'Daily code review, maintainability'
    },
    {
      name: 'Security',
      icon: '🔒',
      color: 'from-red-500 to-red-600',
      description: 'Vulnerabilities, data validation, injection attacks, authentication issues',
      model: 'Claude Sonnet 5',
      command: 'code-review --template security ./src',
      bestFor: 'Production deployments, security audits'
    },
    {
      name: 'Performance',
      icon: '⚡',
      color: 'from-yellow-500 to-yellow-600',
      description: 'Bundle size optimization, async patterns, memory usage',
      model: 'Gemini Flash Lite',
      command: 'code-review --template performance ./src',
      bestFor: 'Optimization, bundle size reduction'
    },
    {
      name: 'TypeScript',
      icon: '📘',
      color: 'from-indigo-500 to-indigo-600',
      description: 'Type safety, strict mode compliance, generic usage',
      model: 'Gemini Flash Lite',
      command: 'code-review --template typescript ./src',
      bestFor: 'Type safety, migration to strict mode'
    },
    {
      name: 'Combined',
      icon: '🎯',
      color: 'from-purple-500 to-purple-600',
      description: 'All review types in one comprehensive analysis',
      model: 'Claude Sonnet 5',
      command: 'code-review --template combined ./src',
      bestFor: 'Comprehensive analysis in single pass',
      recommended: true
    }
  ];

  return (
    <section id="templates" className="relative py-24 text-white scanlines seam-top" style={{ background: 'var(--surface-green)' }}>
      
     
      <div className="relative max-w-6xl mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Templates
            </h2>
            <span className="rule flex-1"></span>
          </div>
          <p className="text-zinc-400 max-w-xl">
            Each template is tuned for one aspect of quality and mapped to the model
            that handles it best.
          </p>
        </div>

        {/* First 4 Templates - 2x2 Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 auto-rows-fr gap-4 mb-4">
          {templates.slice(0, 4).map((template, index) => (
            <div
              key={index}
              className="relative panel p-6 card-hover group flex flex-col"
            >
              <div className="text-center mb-6 flex-1">
                <div className={`w-16 h-16 bg-gradient-to-r from-black/10 to-black/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl opacity-70 group-hover:opacity-100 transition-opacity duration-300`}>
                  {template.icon}
                </div>
                <h3 className="text-lg text-white font-bungee tracking-normal mb-2 opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                  {template.name} Review
                </h3>
                <p className="text-zinc-400 mb-4">
                  {template.description}
                </p>
              </div>

              <div className="space-y-4 rounded-md border border-white/5 bg-black/30 p-5 mt-auto">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Best for:</span>
                  <span className="font-semibold text-white">{template.bestFor}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Model:</span>
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

