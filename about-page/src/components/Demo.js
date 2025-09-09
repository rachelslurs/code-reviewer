import React, { useState } from 'react';

const Demo = () => {
  const [activeDemo, setActiveDemo] = useState('basic');

  const demos = [
    {
      id: 'basic',
      title: 'Basic Usage',
      description: 'Quick quality review of your codebase',
      command: 'code-review ./src',
      output: `🔍 Code Reviewer - Quality Analysis
================================================================================
📁 Scanning: ./src (3 files found)
🤖 Model: gemini-flash (free tier)
📊 Token estimate: 1,200 input, ~800 output

✅ File: src/components/Button.tsx
   📝 Issues found: 2
   ⚠️  Consider using const assertions for better type inference
   💡 Extract magic numbers to named constants

✅ File: src/utils/helpers.ts
   📝 Issues found: 1
   🔧 Add error handling for edge cases

✅ File: src/hooks/useAuth.ts
   📝 Issues found: 0
   ✨ Well-structured custom hook

📊 Summary: 3 files reviewed, 3 issues found
⏱️  Total time: 2.3s
💰 Cost: Free (Gemini Flash)`
    },
    {
      id: 'multi-model',
      title: 'Multi-Model Review',
      description: 'Smart model selection with automatic fallbacks',
      command: 'code-review --multi-model --template combined ./src',
      output: `🎯 Multi-Model Code Review - Combined Template
================================================================================
📁 Scanning: ./src (3 files found)
🤖 Auto-fallback enabled: claude-sonnet → gemini-pro → claude-haiku
✅ Available models: claude-sonnet, gemini-pro

🚀 Initializing multi-model reviewer with 2 models
📊 Token estimate: 2,400 input, ~1,200 output
💰 Estimated cost: $0.007 (Claude Sonnet)

✅ File: src/components/Button.tsx
   🔒 Security: No vulnerabilities detected
   ⚡ Performance: Consider memoization for re-renders
   📘 TypeScript: Type assertions could be improved
   ✨ Quality: Good component structure

✅ File: src/utils/helpers.ts
   🔒 Security: Input validation needed
   ⚡ Performance: Efficient algorithms
   📘 TypeScript: Strong typing throughout
   ✨ Quality: Well-documented functions

📊 Summary: 3 files reviewed, 5 issues found
⏱️  Total time: 4.1s
💰 Cost: $0.007 (Claude Sonnet)`
    },
    {
      id: 'watch',
      title: 'Watch Mode',
      description: 'Continuous monitoring and auto-review',
      command: 'code-review --watch --template quality ./src',
      output: `👀 Watch Mode - Continuous Quality Review
================================================================================
📁 Watching: ./src
🤖 Model: gemini-flash (fast feedback)
🔄 Auto-review on file changes

⏳ Waiting for changes...

📝 File changed: src/components/Header.tsx
🔍 Auto-reviewing...

✅ File: src/components/Header.tsx
   📝 Issues found: 1
   💡 Consider extracting navigation logic to custom hook

📝 File changed: src/utils/dateHelpers.ts
🔍 Auto-reviewing...

✅ File: src/utils/dateHelpers.ts
   📝 Issues found: 0
   ✨ Clean utility functions

📝 File changed: src/hooks/useLocalStorage.ts
🔍 Auto-reviewing...

✅ File: src/hooks/useLocalStorage.ts
   📝 Issues found: 2
   ⚠️  Add error handling for localStorage access
   🔧 Consider using useCallback for event listeners

🔄 Watch mode active - Press Ctrl+C to stop`
    }
  ];

  return (
    <section id="demo" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
            See It In
            <span className="gradient-text"> Action</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            See output examples 
            from the Code Reviewer.
          </p>
        </div>

        {/* Terminal with Tabs */}
        <div className="bg-gray-900 rounded-2xl overflow-hidden shadow-2xl">
          {/* Terminal Header with Tabs */}
          <div className="bg-gray-800 px-6 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* Terminal Controls */}
                <div className="items-center space-x-2 flex">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                
                {/* Tabs */}
                <div className="flex space-x-1">
                  {demos.map((demo) => (
                    <button
                      key={demo.id}
                      onClick={() => setActiveDemo(demo.id)}
                      className={`px-4 py-2 text-xs md:text-sm transition-all duration-300 rounded-t-lg relative ${
                        activeDemo === demo.id
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full  ${activeDemo === demo.id ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                        <span>{demo.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                {demos.find(d => d.id === activeDemo)?.title}
              </h3>
              <p className="text-gray-400 mb-4">
                {demos.find(d => d.id === activeDemo)?.description}
              </p>
              <div className="bg-gray-800 rounded-lg p-4">
                <code className="text-green-400 font-mono text-sm">
                  $ {demos.find(d => d.id === activeDemo)?.command}
                </code>
              </div>
            </div>
            
            <div className="bg-black rounded-lg p-4 overflow-x-auto">
              <pre className="text-green-400 font-mono text-sm whitespace-pre-wrap">
                {demos.find(d => d.id === activeDemo)?.output}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Demo;

