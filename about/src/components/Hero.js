import React from 'react';

const Hero = () => {
  return (
    <section className="relative overflow-hidden scanlines grain bloom bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      {/* Hairline horizon, so the section ends on a drawn edge rather than a fade */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-secondary-700/60 to-transparent"></div>

      <div className="relative max-w-6xl mx-auto px-6 lg:px-8 pt-28 pb-24 lg:pt-36 lg:pb-32">
        {/* Left-aligned like terminal output rather than centred like a template */}
        <div className="max-w-3xl">
          <h1 className="font-bungee text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.08] animate-slide-up">
            Transform your
            <span className="block gradient-text caret">code quality</span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-xl mt-7 leading-relaxed animate-slide-up">
            Multi-model code analysis with schema-constrained findings,
            smart caching, and comprehensive review templates.
          </p>

          {/* The command is the product, so show it rather than describing it */}
          <div className="mt-9 animate-slide-up">
            <div className="inline-flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950/80 px-4 py-3 font-mono text-sm backdrop-blur-sm">
              <span className="text-green-400 select-none">$</span>
              <span className="text-zinc-200">code-review --template security ./src</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-9 animate-slide-up">
            <a
              href="#installation"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-green-400 text-zinc-950 font-semibold text-sm tracking-wide hover:bg-green-300 transition-colors duration-200"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Get Started
            </a>

            <a
              href="https://github.com/rachelslurs/code-reviewer"
              className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-white/15 text-zinc-200 font-semibold text-sm tracking-wide hover:border-green-400/60 hover:text-white transition-colors duration-200"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View on GitHub
            </a>
          </div>

          {/* Quiet proof, in the tool's own voice */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-10 font-mono text-xs text-zinc-400">
            <span><span className="text-green-400">&rsaquo;</span> Claude &amp; Gemini</span>
            <span><span className="text-green-400">&rsaquo;</span> 5 templates</span>
            <span><span className="text-green-400">&rsaquo;</span> JSON output</span>
            <span><span className="text-green-400">&rsaquo;</span> MIT licensed</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
