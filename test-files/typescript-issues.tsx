// TypeScript template test - various TypeScript issues
import React from 'react';

// Using any instead of proper types
const userData: any = {
  name: 'John',
  age: 30,
  settings: {
    theme: 'dark'
  }
};

// Function with implicit any parameters
function processUser(user, options) { // Missing parameter types
  return user.name + options.suffix; // No type checking
}

// Missing return type annotation
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Unsafe type assertion
const config = JSON.parse(localStorage.getItem('config')!) as Config; // Dangerous non-null assertion

// Interface vs type inconsistency
interface User {
  name: string;
  age: number;
}

type Settings = {
  theme: string;
  notifications: boolean;
}

// Missing generic constraints
function updateField<T>(obj: T, field: string, value: any): T { // Generic without constraints
  return { ...obj, [field]: value };
}

// Improper error handling types
function fetchData(): Promise<any> { // Should have specific error types
  return fetch('/api/data')
    .then(res => res.json())
    .catch(error => {
      throw error; // Error type not preserved
    });
}

// Missing type guards
function handleUserInput(input: unknown) {
  // Direct property access without type checking
  console.log(input.name); // Potentially unsafe
  return input.age > 18; // No type narrowing
}

// React component with poor typing
const UserProfile = (props) => { // Missing prop types
  const [user, setUser] = useState(null); // Should specify type
  
  useEffect(() => {
    // Event handler with poor typing
    const handleClick = (event) => { // Missing event type
      console.log(event.target.value);
    };
    
    document.addEventListener('click', handleClick);
  }, []);
  
  // Unsafe property access
  return (
    <div>
      <h1>{props.user.name}</h1> {/* Potential runtime error */}
      <p>Age: {user.age}</p> {/* user could be null */}
    </div>
  );
};

// Union types that could be discriminated unions
type Status = 'loading' | 'success' | 'error';
type ApiResponse = {
  status: Status;
  data?: any; // Should be more specific
  error?: string;
};

// Missing utility types usage
interface UpdateUserRequest {
  id: string;
  name: string;
  age: number;
  email: string;
}

// Could use Partial<User> instead
interface UpdateUserPartial {
  id?: string;
  name?: string;
  age?: number;
  email?: string;
}

// Improper module declarations
declare global {
  interface Window {
    customProperty: any; // Should be more specific
  }
}

export { processUser, calculateTotal, UserProfile, updateField, fetchData, handleUserInput };
