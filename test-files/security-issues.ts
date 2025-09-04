// Security template test - various security vulnerabilities
import express from 'express';
import mysql from 'mysql';

const app = express();

// API key exposed in code
const API_KEY = 'sk-1234567890abcdef'; // Security issue: hardcoded secret

// SQL Injection vulnerability
app.post('/users', (req, res) => {
  const userInput = req.body.query;
  const query = 'SELECT * FROM users WHERE name = ' + userInput; // SQL injection
  
  db.query(query, (err, results) => {
    res.json(results);
  });
});

// XSS vulnerability
app.get('/profile/:userId', (req, res) => {
  const userId = req.params.userId; // Not validated
  const html = `<h1>User Profile: ${userId}</h1>`; // XSS via template
  res.send(html);
});

// Insecure direct object references
app.get('/documents/:id', (req, res) => {
  const docId = req.params.id;
  // No authorization check - any user can access any document
  const filePath = `/documents/${docId}.pdf`;
  res.sendFile(filePath); // Path traversal possible
});

// Weak authentication
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Timing attack vulnerability - comparing strings directly
  if (username === 'admin' && password === 'password123') {
    const token = Buffer.from(username + ':' + Date.now()).toString('base64'); // Weak token
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Command injection vulnerability
app.post('/backup', (req, res) => {
  const filename = req.body.filename;
  const command = `tar -czf ${filename}.tar.gz ./data`; // Command injection
  exec(command, (error, stdout, stderr) => {
    res.json({ message: 'Backup created' });
  });
});

// Information disclosure
app.use((err, req, res, next) => {
  console.log('Error:', err); // Logging sensitive error details
  res.status(500).json({ 
    error: err.message, // Exposing internal error messages
    stack: err.stack    // Exposing stack traces
  });
});

// Missing CORS protection
app.use('/api', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Overly permissive CORS
  next();
});

export default app;
