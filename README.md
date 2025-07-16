# 3D Stick Figure Poser

A sophisticated 3D stick figure posing application built with Three.js, TypeScript, and Vite. Create, manipulate, and export realistic 3D stick figure poses with bone length constraints and intuitive 3D interaction.

## 🚀 Features

- **3D Scene with Orbital Camera Controls**: Navigate around your 3D scene with mouse controls
- **Interactive Joint Manipulation**: Click and drag joints in 3D space to pose your characters
- **Bone Length Constraints**: Maintains realistic bone proportions using inverse kinematics
- **Multiple Characters**: Add and manage multiple stick figures in the same scene
- **Preset Poses**: Quick access to common poses (standing, walking, running, jumping, sitting, T-pose)
- **JSON Import/Export**: Save and load your poses in JSON format
- **Browser State Persistence**: Automatically saves and restores your work when you close and reopen the app
- **Modern UI**: Collapsible panels, intuitive controls, and responsive design
- **Real-time Updates**: See changes immediately as you manipulate joints

### 🎭 Mesh Rendering System

- **Realistic Human Mesh**: Overlay a 3D human mesh over the skeleton for more realistic visualization
- **glTF/GLB Model Support**: Load professional 3D human models from Mixamo or other sources
- **Render Mode Options**: 
  - Both Mesh & Skeleton (default)
  - Mesh Only (clean humanoid appearance)
  - Skeleton Only (traditional stick figure)
- **Customizable Appearance**:
  - Adjustable mesh opacity (0.1 to 1.0)
  - Skin color picker
  - Clothing color picker
  - Mesh quality settings (low/medium/high)
- **3D Model Controls**:
  - Load custom glTF/GLB files
  - Adjustable model opacity and scale
  - Toggle model visibility
- **Anatomical Features**:
  - Realistic torso with chest and waist sections
  - Proportional head and neck
  - Tapered limbs (arms and legs)
  - Hands and feet
  - Proper joint connections and deformation

## 💾 Auto-Save & State Persistence

The app automatically saves your work to browser localStorage, including:
- All character models and their poses
- Camera position and orientation
- Scene settings (grid visibility, joint size, etc.)
- Selected character and joint
- Undo/redo history

**Features:**
- **Auto-save**: Saves every 2 seconds when changes are detected
- **Auto-restore**: Automatically restores your work when you reopen the app
- **Manual export**: Use "Export JSON" for backup files you can share or save elsewhere
- **Import support**: Load previously exported JSON files
- **Cross-session**: Your work persists between browser sessions

The state is stored locally in your browser and never sent to any server, ensuring your work remains private.

## 🛠️ Tech Stack

- **Three.js** - WebGL 3D rendering
- **TypeScript** - Type safety and better development experience
- **Vite** - Fast development builds and hot module replacement
- **CSS3** - Modern UI styling with gradients and animations

## 📦 Installation & Setup

1. **Clone or download** this project
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Start development server**:
   ```bash
   npm run dev
   ```
4. **Open your browser** to `http://localhost:5173`

## 🎮 Usage

### Basic Controls

- **Camera Navigation**:
  - Left mouse: Rotate camera around the scene
  - Middle mouse: Pan the camera
  - Right mouse/Scroll: Zoom in/out

- **Character Manipulation**:
  - Click and drag any joint (colored spheres) to move them in 3D space
  - Bone constraints automatically maintain realistic proportions
  - Use the sidebar controls for precise coordinate input

### Interface

#### Toolbar
- **Add Character**: Add a new stick figure to the scene
- **Clear All**: Remove all characters
- **Export JSON**: Save current poses to a JSON file
- **Import JSON**: Load poses from a JSON file
- **Reset Camera**: Return camera to default position

#### Sidebar Controls

1. **Preset Poses** (Collapsible)
   - Quick access to common poses
   - Click any preset to apply to selected character

2. **Characters**
   - List of all characters in the scene
   - Click to select a character
   - Toggle visibility with the eye button
   - Delete characters with the trash button

3. **Keypoints**
   - Precise coordinate input for selected character
   - Real-time updates as you type
   - Automatically applies bone constraints

4. **3D Settings**
   - Bone Thickness: Adjust the thickness of bones
   - Joint Size: Change the size of joint spheres
   - Grid Visible: Toggle the ground grid

## 🏗️ Architecture

The application follows a modular, object-oriented architecture:

- **`main.ts`**: Main application class with UI management and event handling
- **`ThreeRenderer.ts`**: Three.js scene management, rendering, and raycasting
- **`BoneConstraintSolver.ts`**: Inverse kinematics and bone length constraints
- **`types.ts`**: TypeScript interfaces for type safety

### Key Classes

#### `StickFigureApp3D`
- Central application controller
- Manages characters, UI, and user interactions
- Handles import/export functionality

#### `ThreeRenderer`
- Three.js scene setup and management
- 3D object creation (joints, bones)
- Mouse picking and raycasting
- Camera and lighting control

#### `BoneConstraintSolver`
- Maintains realistic bone lengths
- Applies inverse kinematics
- Joint priority system for natural movement

## 🎨 Customization

### Adding New Presets

Add new poses in the `presets` object in `main.ts`:

```typescript
myCustomPose: {
  head: { x: 0, y: 4.5, z: 0 },
  neck: { x: 0, y: 3.7, z: 0 },
  // ... other joints
}
```

### Modifying Bone Connections

Edit the `boneConnections` array in `BoneConstraintSolver.ts` to change skeleton structure:

```typescript
private boneConnections: Array<[string, string]> = [
  ['head', 'neck'],
  ['neck', 'leftShoulder'],
  // ... add or modify connections
];
```

### Styling

Customize the UI by editing `src/style.css`. The design uses CSS Grid, Flexbox, and modern CSS features.

## 📁 File Structure

```
src/
├── main.ts              # Main application class
├── ThreeRenderer.ts     # Three.js rendering and scene management
├── BoneConstraintSolver.ts # Bone constraints and inverse kinematics
├── types.ts             # TypeScript type definitions
├── style.css            # Application styles
└── vite-env.d.ts        # Vite type definitions

public/
└── vite.svg             # Vite logo

index.html               # Main HTML file
package.json             # Dependencies and scripts
tsconfig.json            # TypeScript configuration
.gitignore              # Git ignore rules
README.md               # This file
```

## 🚀 Building for Production

```bash
npm run build
```

This creates a `dist/` folder with optimized files ready for deployment.

## 🔧 Development

### VS Code Tasks

The project includes VS Code tasks for easy development:

- **Dev Server**: Run `Ctrl+Shift+P` > "Tasks: Run Task" > "dev"

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is open source and available under the MIT License.

## 🎯 Future Enhancements

- Export to 3D formats (OBJ, STL)
- Animation timeline and keyframes
- Physics simulation
- VR/AR support
- Collaborative editing
- More complex skeletal structures
- Muscle and skin simulation

---

**Happy Posing!** 🎭✨
