import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-primary-950 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="text-gray-400 text-sm mb-4 md:mb-0">
            © {new Date().getFullYear()} Code Reviewer. Built by <a href="https://rachel.fyi" className=' hover:text-white transition-colors duration-300'>Rachel</a>.
          </div>
          <div className="flex space-x-6 text-sm">
            <a href="https://github.com/rachelslurs/code-reviewer/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors duration-300">
              MIT License
            </a>
            <a href="https://github.com/rachelslurs/code-reviewer" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white transition-colors duration-300">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

