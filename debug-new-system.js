// Debug script to test the new joint system
// Run this in the browser console after loading a GLB model

console.log("🔍 Testing New Joint System");

// Check if the app exists
if (window.app) {
    console.log("✅ App found");
    
    // Check characters
    const characters = window.app.characters;
    console.log(`📊 Characters: ${characters.length}`);
    
    if (characters.length > 0) {
        const character = characters[0];
        console.log(`🎭 Character: ${character.name}`);
        console.log(`🎯 Joints: ${Object.keys(character.keypoints).length}`);
        
        // List all joints
        console.log("📋 Available joints:");
        Object.keys(character.keypoints).forEach(jointName => {
            const pos = character.keypoints[jointName];
            console.log(`  • ${jointName}: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`);
        });
        
        // Test moving a joint
        const firstJoint = Object.keys(character.keypoints)[0];
        if (firstJoint) {
            console.log(`🎯 Testing movement of joint: ${firstJoint}`);
            const originalPos = { ...character.keypoints[firstJoint] };
            
            // Move the joint
            character.keypoints[firstJoint].y += 0.5;
            
            // Update the character
            window.app.renderer.updateCharacter(character);
            
            console.log(`✅ Moved ${firstJoint} from Y=${originalPos.y.toFixed(2)} to Y=${character.keypoints[firstJoint].y.toFixed(2)}`);
            console.log("👀 Check if the GLB model moved!");
            
            // Reset after 2 seconds
            setTimeout(() => {
                character.keypoints[firstJoint] = originalPos;
                window.app.renderer.updateCharacter(character);
                console.log(`🔄 Reset ${firstJoint} to original position`);
            }, 2000);
        }
    } else {
        console.log("❌ No characters found. Load a GLB model first.");
    }
} else {
    console.log("❌ App not found. Make sure the page is loaded.");
}
