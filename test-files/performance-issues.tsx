// Performance template test - various performance issues
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns'; // Heavy import that could be tree-shaken
import _ from 'lodash'; // Entire lodash imported instead of specific functions

// Heavy computation without memoization
const ExpensiveComponent = ({ items, multiplier }) => {
  const [data, setData] = useState([]);
  
  // Expensive operation on every render
  const processedData = items
    .map(item => ({ ...item, processed: true }))
    .filter(item => item.active)
    .map(item => ({ ...item, value: item.value * multiplier }))
    .sort((a, b) => a.name.localeCompare(b.name)); // Multiple array passes
  
  // Effect without dependencies
  useEffect(() => {
    // Potentially infinite re-renders
    setData(processedData);
  });
  
  // Event handler created on every render
  const handleClick = (item) => {
    // Heavy operation
    const result = items.map(i => {
      if (i.id === item.id) {
        return { ...i, clicked: true };
      }
      return i;
    });
    console.log('Processing', result);
  };
  
  return (
    <div>
      {/* Large list without virtualization */}
      {processedData.map((item, index) => (
        <div key={index} onClick={() => handleClick(item)}>
          <span>{format(new Date(), 'yyyy-MM-dd')}</span> {/* Date formatting on every item */}
          <span>{item.name}</span>
          {/* Expensive operation in render */}
          <span>{JSON.stringify(item)}</span>
        </div>
      ))}
    </div>
  );
};

// Memory leak in useEffect
const LeakyComponent = () => {
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Running interval');
    }, 1000);
    
    // Missing cleanup - memory leak
  }, []);
  
  return <div>Leaky component</div>;
};

// Inefficient async operations
const DataFetcher = ({ userIds }) => {
  const [userData, setUserData] = useState({});
  
  useEffect(() => {
    // Sequential API calls instead of parallel
    userIds.forEach(async (userId) => {
      const response = await fetch(`/api/users/${userId}`);
      const user = await response.json();
      setUserData(prev => ({ ...prev, [userId]: user }));
    });
  }, [userIds]);
  
  return <div>{JSON.stringify(userData)}</div>;
};

// O(n²) algorithm that could be O(n)
function findDuplicates(arr) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}

// Blocking synchronous operation
function processLargeFile(data) {
  // Synchronous processing of large data
  let result = '';
  for (let i = 0; i < data.length; i++) {
    result += data[i].toUpperCase(); // Blocking main thread
  }
  return result;
}

export { ExpensiveComponent, LeakyComponent, DataFetcher, findDuplicates, processLargeFile };
