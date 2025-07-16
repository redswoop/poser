// Test script for auto-loading GLB model
// Run this in the browser console to verify auto-loading

console.log("🧪 Testing Auto-Loading GLB Model");

// Wait for the app to load
setTimeout(() => {
    if (window.app) {
        console.log("✅ App loaded");
        
        // Check if GLTF model is loaded
        const isGLTFLoaded = window.app.renderer.isGLTFModelLoaded();
        console.log(`📦 GLTF Model loaded: ${isGLTFLoaded}`);
        
        // Check characters
        const characters = window.app.characters;
        console.log(`👥 Characters: ${characters.length}`);
        
        if (characters.length > 0) {
            const character = characters[0];
            console.log(`🎭 Character: ${character.name}`);
            console.log(`🎯 Joints: ${Object.keys(character.keypoints).length}`);
            
            // List some key joints
            const joints = Object.keys(character.keypoints);
            console.log(`📋 First 10 joints: ${joints.slice(0, 10).join(', ')}`);
            
            console.log("✅ Auto-loading test successful!");
        } else {
            console.log("⚠️ No characters found - auto-loading may have failed");
        }
        
        // Check GLTF settings
        const gltfSettings = window.app.renderer.getGLTFSettings();
        console.log(`🔧 GLTF Settings:`, gltfSettings);
        
    } else {
        console.log("❌ App not found");
    }
}, 2000); // Wait 2 seconds for loading

console.log("⏳ Waiting for auto-loading to complete...");
