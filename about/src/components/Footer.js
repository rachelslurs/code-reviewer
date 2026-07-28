import React from 'react';

const Footer = () => {
  return (
    <footer className="relative text-white bg-zinc-950">
      {/* Drawn edge, matching the hairline that closes the hero */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent"></div>
      {/* One step down from the py-24 the sections run, kept symmetric so the single
          row sits on the optical centre of the band. */}
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-16">

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center">
          {/* Bungee is the display face from the hero. It runs wide and sets in caps,
              so it stays a step below the links here rather than leading the footer. */}
          <div className="font-bungee text-zinc-400 text-xs tracking-wide mb-4 md:mb-0">
            {/* The dot is aria-hidden, so the literal spaces around it are what keep
                the two phrases apart when the line is read aloud. */}
            © {new Date().getFullYear()} Code Reviewer{' '}<span className="dot-sep mx-2" aria-hidden="true"></span>{' '}Built by <a href="https://rachel.fyi" className="text-green-400 underline decoration-green-400/40 underline-offset-4 hover:text-green-300 hover:decoration-green-300 transition-colors duration-300">Rachel</a>
          </div>
          {/* Set to the same size and case as the copyright, so the two ends of the
              row read as one line rather than two typographic systems. */}
          <div className="flex space-x-6 text-xs uppercase tracking-widest">
            <a href="https://github.com/rachelslurs/code-reviewer/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors duration-300">
              MIT License
            </a>
            <a href="https://github.com/rachelslurs/code-reviewer" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors duration-300">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

