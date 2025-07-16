// Browser console test for character state saving
// Run this in the browser console to test the saving functionality

console.log('🧪 Testing character state saving system...');

// Test 1: Check if the app is loaded
if (typeof window !== 'undefined' && window.app) {
  console.log('✅ App found on window object');
} else {
  console.log('❌ App not found - trying to access through DOM');
}

// Test 2: Check localStorage for saved state
const savedState = localStorage.getItem('poser3d-app-state');
if (savedState) {
  console.log('✅ Found saved state in localStorage:', JSON.parse(savedState));
} else {
  console.log('⚠️ No saved state found in localStorage');
}

// Test 3: Manual state testing function
function testStateSaving() {
  console.log('--- Manual State Test ---');
  
  // Wait for page to load
  setTimeout(() => {
    const stateCheck = localStorage.getItem('poser3d-app-state');
    if (stateCheck) {
      const state = JSON.parse(stateCheck);
      console.log('📊 Current state analysis:');
      console.log('- Characters:', state.characters?.length || 0);
      console.log('- Model path:', state.currentModelPath);
      console.log('- Bone rotations:', state.characters?.[0]?.boneRotations ? Object.keys(state.characters[0].boneRotations).length : 0);
      console.log('- Selected joint:', state.selectedJoint);
      console.log('- Timestamp:', new Date(state.timestamp).toLocaleString());
    }
  }, 2000);
}

// Test 4: Monitor state changes
let lastStateCheck = '';
function monitorStateChanges() {
  const currentState = localStorage.getItem('poser3d-app-state');
  if (currentState !== lastStateCheck) {
    console.log('🔄 State changed at:', new Date().toLocaleTimeString());
    lastStateCheck = currentState;
  }
}

// Instructions
console.log('🎯 To test the system:');
console.log('1. Move some bones around');
console.log('2. Adjust sliders');
console.log('3. Run testStateSaving() to check if state is saved');
console.log('4. Refresh the page to see if state is restored');
console.log('5. setInterval(monitorStateChanges, 1000) to watch for changes');

// Auto-run the test
testStateSaving();
