// Test script to verify GLTF rigging works
// Open browser console and run this after loading a GLB model

console.log("🧪 Testing GLTF Rigging System");

// Get the renderer instance
const renderer = window.app?.renderer;

if (!renderer) {
  console.error("❌ Renderer not found. Make sure the app is loaded.");
} else {
  console.log("✅ Renderer found");
  
  // Check if GLTF model is loaded
  if (renderer.isGLTFModelLoaded()) {
    console.log("✅ GLTF model is loaded");
    
    // Get the first character
    const characters = window.app?.characters;
    if (characters && characters.length > 0) {
      const character = characters[0];
      console.log(`✅ Found character: ${character.name}`);
      
      // Test pose change
      console.log("🎯 Testing pose change...");
      
      // Move the right arm up
      if (character.keypoints.rightElbow) {
        const originalY = character.keypoints.rightElbow.y;
        character.keypoints.rightElbow.y = originalY + 1.0;
        
        // Update the character
        renderer.updateCharacter(character);
        
        console.log("✅ Moved right elbow up by 1.0 units");
        console.log("👀 Check if the GLB model's arm moved!");
        
        // Reset after 3 seconds
        setTimeout(() => {
          character.keypoints.rightElbow.y = originalY;
          renderer.updateCharacter(character);
          console.log("🔄 Reset right elbow position");
        }, 3000);
      }
    } else {
      console.log("❌ No characters found");
    }
  } else {
    console.log("❌ No GLTF model loaded. Load a GLB file first.");
  }
}
