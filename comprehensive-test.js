// Test Procedure for Character State Saving
// Copy and paste this into the browser console

console.log('🧪 Starting comprehensive state saving test...');

// Test 1: Clear any existing state
console.log('🗑️ Step 1: Clearing any existing state...');
localStorage.removeItem('poser3d-app-state');
console.log('✅ State cleared, please refresh the page');

// Test 2: After refresh, run this to verify initial state
function testInitialState() {
  console.log('\n🔍 Step 2: Testing initial state...');
  
  const savedState = localStorage.getItem('poser3d-app-state');
  console.log('Initial localStorage state:', savedState ? 'Found' : 'Empty');
  
  if (window.app) {
    console.log('✅ App found on window');
    
    // Test if we can get bone rotations
    const boneRotations = window.app.testStateSaving();
    console.log('Test completed');
  } else {
    console.log('❌ App not found on window');
  }
}

// Test 3: After making changes, run this
function testAfterChanges() {
  console.log('\n🔄 Step 3: Testing after making changes...');
  
  console.log('📝 Instructions:');
  console.log('1. Move some bones around');
  console.log('2. Change the model opacity slider');
  console.log('3. Change the model scale slider');
  console.log('4. Then run this test');
  
  // Force a save
  if (window.app) {
    window.app.testStateSaving();
  }
  
  const savedState = localStorage.getItem('poser3d-app-state');
  if (savedState) {
    const state = JSON.parse(savedState);
    console.log('✅ State found after changes');
    console.log('- Characters:', state.characters?.length || 0);
    console.log('- Model path:', state.currentModelPath || 'None');
    console.log('- Bone rotations:', state.characters?.[0]?.boneRotations ? Object.keys(state.characters[0].boneRotations).length : 0);
    console.log('- Model settings:', state.modelSettings);
  } else {
    console.log('❌ No state found after changes');
  }
}

// Test 4: After refresh, run this to verify restoration
function testAfterRefresh() {
  console.log('\n🔄 Step 4: Testing after refresh...');
  
  console.log('📝 Instructions:');
  console.log('1. Make changes (move bones, adjust sliders)');
  console.log('2. Refresh the page');
  console.log('3. Run this test to verify everything was restored');
  
  const savedState = localStorage.getItem('poser3d-app-state');
  if (savedState) {
    const state = JSON.parse(savedState);
    console.log('✅ State found after refresh');
    console.log('- Last saved:', new Date(state.timestamp).toLocaleString());
    console.log('- Characters:', state.characters?.length || 0);
    console.log('- Model path:', state.currentModelPath || 'None');
    console.log('- Bone rotations:', state.characters?.[0]?.boneRotations ? Object.keys(state.characters[0].boneRotations).length : 0);
    console.log('- Selected joint:', state.selectedJoint || 'None');
    console.log('- Model settings:', state.modelSettings);
  } else {
    console.log('❌ No state found after refresh');
  }
}

// Test 5: Export/Import test
function testExportImport() {
  console.log('\n📁 Step 5: Testing export/import...');
  
  if (window.app) {
    try {
      const exported = window.app.exportCharacterState();
      console.log('✅ Export successful');
      console.log('Exported data:', JSON.parse(exported));
      
      // Test import
      window.app.importCharacterState(exported);
      console.log('✅ Import successful');
    } catch (error) {
      console.error('❌ Export/Import failed:', error);
    }
  } else {
    console.log('❌ App not available for export/import test');
  }
}

console.log('\n📋 Test Instructions:');
console.log('1. First run: testInitialState()');
console.log('2. Make changes, then run: testAfterChanges()');
console.log('3. Refresh page, then run: testAfterRefresh()');
console.log('4. Test export/import: testExportImport()');
console.log('\n🎯 All functions are now available in the console!');

// Make functions available globally
window.testInitialState = testInitialState;
window.testAfterChanges = testAfterChanges;
window.testAfterRefresh = testAfterRefresh;
window.testExportImport = testExportImport;
