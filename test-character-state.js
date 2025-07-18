// Test script to verify character state saving and loading
// This should be run in the browser console

// Function to test the save/load functionality
function testCharacterStateSaving() {
  console.log('🧪 Testing character state saving and loading...');
  
  // Check if the app instance exists
  if (typeof window.app === 'undefined') {
    console.error('❌ App instance not found on window object');
    return;
  }
  
  // Test exporting character state
  try {
    const characterState = window.app.exportCharacterState();
    console.log('✅ Export successful:', JSON.parse(characterState));
  } catch (error) {
    console.error('❌ Export failed:', error);
  }
  
  // Test importing character state
  try {
    const testState = {
      modelPath: '/woman.glb',
      boneRotations: {},
      selectedJoint: null,
      timestamp: Date.now(),
      version: '1.0.0'
    };
    
    window.app.importCharacterState(JSON.stringify(testState));
    console.log('✅ Import test successful');
  } catch (error) {
    console.error('❌ Import failed:', error);
  }
}

// Instructions
console.log('To test the character state saving:');
console.log('1. Open the browser console');
console.log('2. Run: testCharacterStateSaving()');
console.log('3. Try moving some bones and then export/import');
