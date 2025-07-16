// Simple test in browser console
// Check if localStorage works at all

console.log('Testing localStorage...');
localStorage.setItem('test', 'hello');
console.log('Test save result:', localStorage.getItem('test'));

// Check if app exists
console.log('App exists:', typeof window.app !== 'undefined');

// Check current state
const state = localStorage.getItem('poser3d-app-state');
console.log('Current saved state:', state ? JSON.parse(state) : 'none');

// If app exists, force a save
if (window.app) {
  console.log('Forcing save...');
  window.app.testStateSaving();
}
