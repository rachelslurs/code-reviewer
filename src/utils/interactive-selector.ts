import { FileInfo } from '../core/file-scanner.js';

export interface SelectionResult {
  selectedFiles: FileInfo[];
  cancelled: boolean;
}

export class InteractiveSelector {
  static async selectFiles(files: FileInfo[]): Promise<SelectionResult> {
    if (files.length === 0) {
      return { selectedFiles: [], cancelled: false };
    }

    console.log('\n📁 Select files to review:\n');
    
    // Show files with checkboxes
    const selections = new Map<number, boolean>();
    
    // Initialize all as selected
    files.forEach((_, index) => selections.set(index, true));
    
    this.displayFileList(files, selections);
    
    let currentInput = '';
    console.log('\nCommands:');
    console.log('  • Enter numbers to toggle (e.g., "1 3 5" or "1-5")');
    console.log('  • "all" - select all files');
    console.log('  • "none" - deselect all files');
    console.log('  • "review" or "r" - start review with selected files');
    console.log('  • "quit" or "q" - cancel');
    console.log('  • "help" or "h" - show this help');
    
    return new Promise((resolve) => {
      const handleInput = (input: string) => {
        const command = input.trim().toLowerCase();
        
        if (command === 'review' || command === 'r') {
          const selectedFiles = files.filter((_, index) => selections.get(index));
          console.log(`\n🚀 Starting review of ${selectedFiles.length} selected files...\n`);
          resolve({ selectedFiles, cancelled: false });
          return;
        }
        
        if (command === 'quit' || command === 'q') {
          console.log('\n❌ Review cancelled');
          resolve({ selectedFiles: [], cancelled: true });
          return;
        }
        
        if (command === 'all') {
          files.forEach((_, index) => selections.set(index, true));
          console.clear();
          console.log('\n📁 Select files to review:\n');
          this.displayFileList(files, selections);
          this.showCommands();
          return;
        }
        
        if (command === 'none') {
          files.forEach((_, index) => selections.set(index, false));
          console.clear();
          console.log('\n📁 Select files to review:\n');
          this.displayFileList(files, selections);
          this.showCommands();
          return;
        }
        
        if (command === 'help' || command === 'h') {
          this.showCommands();
          return;
        }
        
        // Handle number selections
        if (this.handleNumberSelection(command, selections, files.length)) {
          console.clear();
          console.log('\n📁 Select files to review:\n');
          this.displayFileList(files, selections);
          this.showCommands();
        } else {
          console.log('❌ Invalid input. Type "help" for commands.');
        }
      };

      // Simple input handling for Node.js
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      console.log('\n> ');
      process.stdout.write('Type command: ');
      
      const onData = (key: string) => {
        if (key === '\u0003') { // Ctrl+C
          process.exit();
        }
        
        if (key === '\r' || key === '\n') {
          console.log('');
          handleInput(currentInput);
          currentInput = '';
          if (process.stdin.readable) {
            process.stdout.write('Type command: ');
          }
          return;
        }
        
        if (key === '\u007f') { // Backspace
          if (currentInput.length > 0) {
            currentInput = currentInput.slice(0, -1);
            process.stdout.write('\b \b');
          }
          return;
        }
        
        currentInput += key;
        process.stdout.write(key);
      };
      
      process.stdin.on('data', onData);
      
      // Cleanup function
      const cleanup = () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
      };
      
      // Ensure cleanup happens
      process.on('exit', cleanup);
      process.on('SIGINT', cleanup);
    });
  }
  
  private static displayFileList(files: FileInfo[], selections: Map<number, boolean>): void {
    files.forEach((file, index) => {
      const isSelected = selections.get(index);
      const checkbox = isSelected ? '✅' : '⬜';
      const sizeStr = this.formatBytes(file.size);
      const pathDisplay = file.relativePath.length > 50 
        ? '...' + file.relativePath.slice(-47) 
        : file.relativePath;
      
      console.log(`${(index + 1).toString().padStart(2)}. ${checkbox} ${pathDisplay} ${sizeStr.padStart(8)}`);
    });
    
    const selectedCount = Array.from(selections.values()).filter(Boolean).length;
    console.log(`\n📊 ${selectedCount}/${files.length} files selected`);
  }
  
  private static showCommands(): void {
    console.log('\nCommands: numbers to toggle | "all" | "none" | "review" | "quit" | "help"');
  }
  
  private static handleNumberSelection(input: string, selections: Map<number, boolean>, maxFiles: number): boolean {
    try {
      const parts = input.split(/[\s,]+/).filter(part => part.length > 0);
      
      for (const part of parts) {
        if (part.includes('-')) {
          // Range like "1-5"
          const [start, end] = part.split('-').map(n => parseInt(n.trim()));
          if (isNaN(start) || isNaN(end) || start < 1 || end > maxFiles || start > end) {
            return false;
          }
          for (let i = start; i <= end; i++) {
            const current = selections.get(i - 1);
            selections.set(i - 1, !current);
          }
        } else {
          // Single number
          const num = parseInt(part);
          if (isNaN(num) || num < 1 || num > maxFiles) {
            return false;
          }
          const current = selections.get(num - 1);
          selections.set(num - 1, !current);
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  private static formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `(${size.toFixed(size < 10 ? 1 : 0)}${units[unitIndex]})`;
  }
}
