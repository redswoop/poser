<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# 3D Stick Figure Poser Project Instructions

This is a 3D stick figure posing application built with:
- **Three.js** for WebGL 3D rendering
- **TypeScript** for type safety
- **Vite** for fast development builds

## Key Components:
- 3D scene with orbital camera controls
- Interactive joint manipulation in 3D space
- Bone length constraint system with inverse kinematics
- Modern UI with collapsible panels
- Preset pose system
- JSON import/export functionality

## Coding Guidelines:
- Use Three.js Vector3 for all 3D coordinates
- Implement proper raycasting for 3D mouse interaction
- Maintain bone length constraints during joint manipulation
- Use OrbitControls for camera movement
- Keep UI responsive and intuitive for 3D interactions
- Export poses in both JSON and 3D formats

## Architecture:
- Modular class-based structure
- Separate concerns: rendering, interaction, constraints, UI
- Type-safe interfaces for poses and characters
- Event-driven interaction system
