// Quality template test - multiple code quality issues
import React, { useState } from 'react';
import * as fs from 'fs'; // Unused import

const x: any = 'test'; // Poor typing
var unused = 'never used'; // Unused variable with var

// Poor function naming and complexity
function process(data) {
  // Missing error handling
  if (data.items) {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].type == 'active') { // Should use strict equality
        for (let j = 0; j < data.items[i].children.length; j++) {
          // Deeply nested logic
          if (data.items[i].children[j].status === 'pending') {
            console.log('Processing item'); // Magic string
            // Complex nested operations
            data.items[i].children[j].processed = true;
            data.items[i].children[j].timestamp = Date.now();
          }
        }
      }
    }
  }
  return data;
}

// Duplicate code pattern
function processActive(data) {
  if (data.items) {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].type == 'active') {
        // Same logic duplicated
        console.log('Processing active item');
      }
    }
  }
}

// Component with issues
const MyComponent = (props) => { // Missing prop types
  const [count, setCount] = useState(0);
  
  return (
    <div>
      {/* Missing key props */}
      {props.items.map(item => 
        <div onClick={() => setCount(count + 1)}>
          {item.name}
        </div>
      )}
    </div>
  );
};

export default MyComponent;
