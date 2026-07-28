import React from 'react';

const Installation = () => {

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
    <section id="installation" className="relative py-24 seam-top" style={{ background: 'var(--surface-lit)' }}>
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <h2 className="text-3xl sm:text-4xl font-bold text-zinc-900">
              Installation
            </h2>
            <span className="rule-lit flex-1"></span>
          </div>
        </div>

        {/* Prerequisites. Four short links, so they read as one row rather than a stack. */}
        <div className="mb-8">
          <h3 className="font-bungee text-sm text-zinc-700 mb-3">Prerequisites</h3>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {requirements.map((req, index) => (
              <li key={index} className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-secondary-700 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <a
                  href={req.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${req.name} - ${req.description}`}
                  className="text-sm text-secondary-700 hover:text-secondary-900 font-medium"
                >
                  {req.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Installation Steps */}
        <div className="space-y-6">
          {installationSteps.quick.map((step, index) => (
            <div key={index} className="panel-lit rounded-2xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-start space-x-6">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-secondary-100 rounded-full flex items-center justify-center">
                    <span className="text-secondary-800 text-lg font-bungee">{step.step}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bungee tracking-tight text-zinc-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-zinc-600 mb-4">
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

