import React, { useState } from 'react';

const Installation = () => {
  const [prerequisitesOpen, setPrerequisitesOpen] = useState(false);

  const installationSteps = {
    quick: [
      {
        step: 1,
        title: 'Clone & Install',
        description: 'Get the repository and install dependencies',
        command: 'git clone git@github.com:rachelslurs/code-reviewer.git\ncd code-reviewer\nbun install && bun run build'
      },
      {
        step: 2,
        title: 'Set up Authentication',
        description: 'Configure your AI model access',
        command: '# Claude Code (Recommended)\nclaude setup-token\nexport GEMINI_API_KEY="your-key"\n\n# OR API Keys\nexport ANTHROPIC_API_KEY="your-key"\nexport GEMINI_API_KEY="your-key"'
      },
      {
        step: 3,
        title: 'Test Installation',
        description: 'Verify everything is working',
        command: './bin/code-review --help'
      },
      {
        step: 4,
        title: 'Start Reviewing',
        description: 'Begin reviewing your code',
        command: './bin/code-review ./src'
      },
      {
        step: 5,
        title: 'Global Installation (Optional)',
        description: 'Make code-review available from any directory',
        command: '# Add to your shell profile\necho \'export PATH="$PATH:$(pwd)/bin"\' >> ~/.zshrc\nsource ~/.zshrc\n\n# Now you can use from anywhere:\ncode-review ./src'
      }
    ],
  };

  const requirements = [
    {
      name: 'Bun',
      description: 'Modern JavaScript runtime',
      link: 'https://bun.sh',
      required: true
    },
    {
      name: 'Claude Code CLI',
      description: 'Recommended for Claude access',
      link: 'https://www.anthropic.com/claude-code',
      required: false
    },
    {
      name: 'Anthropic API Key',
      description: 'Alternative Claude authentication',
      link: 'https://console.anthropic.com',
      required: false
    },
    {
      name: 'Gemini API Key',
      description: 'Optional but recommended',
      link: 'https://aistudio.google.com',
      required: false
    }
  ];

  return (
    <section id="installation" className="py-16 bg-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            Installation
          </h2>
        </div>

        {/* Prerequisites - Collapsible */}
        <div className="mb-8">
          <button
            onClick={() => setPrerequisitesOpen(!prerequisitesOpen)}
            className="w-full text-left flex items-center justify-between transition-colors duration-200 px-2 py-2 rounded"
          >
            <h3 className="text-lg font-medium text-gray-700">
              Prerequisites
            </h3>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                prerequisitesOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          {prerequisitesOpen && (
            <div className="mt-4">
              <ul className="space-y-2">
                {requirements.map((req, index) => (
                  <li key={index} className="flex items-center space-x-3">
                    <svg className="w-5 h-5 text-primary-700 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <a
                      href={req.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${req.name} - ${req.description}`}
                      className="text-primary-700 hover:text-primary-900 font-medium"
                    >
                      {req.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Installation Steps */}
        <div className="space-y-6">
          {installationSteps.quick.map((step, index) => (
            <div key={index} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start space-x-6">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                    <span className="text-primary-600 font-bold text-lg">{step.step}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {step.description}
                  </p>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 font-mono text-sm whitespace-pre-wrap">
                      {step.command}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Installation;

