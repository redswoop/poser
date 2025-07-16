import './style.css';
import * as THREE from 'three';
import { ThreeRenderer } from './ThreeRenderer';
import { BoneConstraintSolver } from './BoneConstraintSolver';
import { UndoRedoManager } from './UndoRedoManager';
import { BrowserStateManager } from './BrowserStateManager';
import type { Character, Preset, SceneSettings, AppState } from './types';

class StickFigureApp3D {
  private renderer!: ThreeRenderer;
  private constraintSolver: BoneConstraintSolver;
  private undoRedoManager: UndoRedoManager;
  private stateManager: BrowserStateManager;
  private characters: Character[] = [];
  private selectedCharacter: Character | null = null;
  private selectedJoint: string | null = null;
  private nextCharacterId = 1;
  private isDragging = false;
  private dragTarget: { character: Character; jointName: string } | null = null;
  private dragStartState: AppState | null = null;
  private hasShownSelectionHelp = false; // Track if we've shown the sticky selection help

  // UI Elements
  private canvasContainer: HTMLElement;
  private charactersContainer: HTMLElement;
  private keypointsContainer: HTMLElement;
  private presetButtonsContainer: HTMLElement;

  // Presets
  private presets: Record<string, Preset> = {
    standing: {
      head: { x: 0, y: 4.5, z: 0 },
      neck: { x: 0, y: 3.7, z: 0 },
      leftShoulder: { x: -0.7, y: 3.7, z: 0 },
      rightShoulder: { x: 0.7, y: 3.7, z: 0 },
      leftElbow: { x: -1, y: 2.5, z: 0.3 },
      leftWrist: { x: -1.2, y: 1.4, z: 0.5 },
      rightElbow: { x: 1, y: 2.5, z: 0.3 },
      rightWrist: { x: 1.2, y: 1.4, z: 0.5 },
      spine: { x: 0, y: 2.3, z: 0 },
      leftHip: { x: -0.5, y: 2.3, z: 0 },
      rightHip: { x: 0.5, y: 2.3, z: 0 },
      leftKnee: { x: -0.5, y: 0.7, z: 0 },
      leftAnkle: { x: -0.5, y: -0.9, z: 0 },
      rightKnee: { x: 0.5, y: 0.7, z: 0 },
      rightAnkle: { x: 0.5, y: -0.9, z: 0 }
    },
    walking: {
      head: { x: 0, y: 4.5, z: 0 },
      neck: { x: 0, y: 3.7, z: 0 },
      leftShoulder: { x: -0.7, y: 3.7, z: 0 },
      rightShoulder: { x: 0.7, y: 3.7, z: 0 },
      leftElbow: { x: -0.5, y: 2.5, z: 0.8 },
      leftWrist: { x: -0.3, y: 1.4, z: 1.2 },
      rightElbow: { x: 1.5, y: 2.5, z: -0.8 },
      rightWrist: { x: 1.7, y: 1.4, z: -1.2 },
      spine: { x: 0, y: 2.3, z: 0 },
      leftHip: { x: -0.5, y: 2.3, z: 0 },
      rightHip: { x: 0.5, y: 2.3, z: 0 },
      leftKnee: { x: -0.3, y: 0.7, z: 0.8 },
      leftAnkle: { x: -0.1, y: -0.9, z: 1.2 },
      rightKnee: { x: 0.7, y: 0.7, z: -0.8 },
      rightAnkle: { x: 0.9, y: -0.9, z: -1.2 }
    },
    tPose: {
      head: { x: 0, y: 4.5, z: 0 },
      neck: { x: 0, y: 3.7, z: 0 },
      leftShoulder: { x: -0.7, y: 3.7, z: 0 },
      rightShoulder: { x: 0.7, y: 3.7, z: 0 },
      leftElbow: { x: -1.9, y: 3.7, z: 0 },
      leftWrist: { x: -3.1, y: 3.7, z: 0 },
      rightElbow: { x: 1.9, y: 3.7, z: 0 },
      rightWrist: { x: 3.1, y: 3.7, z: 0 },
      spine: { x: 0, y: 2.3, z: 0 },
      leftHip: { x: -0.5, y: 2.3, z: 0 },
      rightHip: { x: 0.5, y: 2.3, z: 0 },
      leftKnee: { x: -0.5, y: 0.7, z: 0 },
      leftAnkle: { x: -0.5, y: -0.9, z: 0 },
      rightKnee: { x: 0.5, y: 0.7, z: 0 },
      rightAnkle: { x: 0.5, y: -0.9, z: 0 }
    },
    running: {
      head: { x: 0.2, y: 4.3, z: 0 },
      neck: { x: 0.2, y: 3.5, z: 0 },
      leftShoulder: { x: -0.5, y: 3.5, z: 0 },
      rightShoulder: { x: 0.9, y: 3.5, z: 0 },
      leftElbow: { x: -0.8, y: 2.5, z: 1.2 },
      leftWrist: { x: -1.2, y: 1.5, z: 1.8 },
      rightElbow: { x: 1.8, y: 2.3, z: -1.5 },
      rightWrist: { x: 2.2, y: 1.2, z: -2.0 },
      spine: { x: 0.2, y: 2.1, z: 0 },
      leftHip: { x: -0.3, y: 2.1, z: 0 },
      rightHip: { x: 0.7, y: 2.1, z: 0 },
      leftKnee: { x: -0.1, y: 1.5, z: 1.5 },
      leftAnkle: { x: 0.1, y: -0.5, z: 2.2 },
      rightKnee: { x: 0.9, y: 0.2, z: -1.2 },
      rightAnkle: { x: 1.1, y: -0.9, z: -1.8 }
    },
    jumping: {
      head: { x: 0, y: 5.2, z: 0 },
      neck: { x: 0, y: 4.4, z: 0 },
      leftShoulder: { x: -0.7, y: 4.4, z: 0 },
      rightShoulder: { x: 0.7, y: 4.4, z: 0 },
      leftElbow: { x: -1.5, y: 4.8, z: 0.5 },
      leftWrist: { x: -2.0, y: 5.2, z: 0.8 },
      rightElbow: { x: 1.5, y: 4.8, z: 0.5 },
      rightWrist: { x: 2.0, y: 5.2, z: 0.8 },
      spine: { x: 0, y: 3.0, z: 0 },
      leftHip: { x: -0.5, y: 3.0, z: 0 },
      rightHip: { x: 0.5, y: 3.0, z: 0 },
      leftKnee: { x: -0.8, y: 2.2, z: 0.8 },
      leftAnkle: { x: -1.0, y: 1.5, z: 1.2 },
      rightKnee: { x: 0.8, y: 2.2, z: 0.8 },
      rightAnkle: { x: 1.0, y: 1.5, z: 1.2 }
    },
    sitting: {
      head: { x: 0, y: 4.5, z: 0 },
      neck: { x: 0, y: 3.7, z: 0 },
      leftShoulder: { x: -0.7, y: 3.7, z: 0 },
      rightShoulder: { x: 0.7, y: 3.7, z: 0 },
      leftElbow: { x: -1.2, y: 2.8, z: 0.8 },
      leftWrist: { x: -1.5, y: 2.0, z: 1.2 },
      rightElbow: { x: 1.2, y: 2.8, z: 0.8 },
      rightWrist: { x: 1.5, y: 2.0, z: 1.2 },
      spine: { x: 0, y: 2.3, z: 0 },
      leftHip: { x: -0.5, y: 2.3, z: 0 },
      rightHip: { x: 0.5, y: 2.3, z: 0 },
      leftKnee: { x: -0.5, y: 2.0, z: 1.6 },
      leftAnkle: { x: -0.5, y: 1.5, z: 2.5 },
      rightKnee: { x: 0.5, y: 2.0, z: 1.6 },
      rightAnkle: { x: 0.5, y: 1.5, z: 2.5 }
    }
  };

  constructor() {
    this.constraintSolver = new BoneConstraintSolver();
    this.undoRedoManager = new UndoRedoManager();
    this.stateManager = new BrowserStateManager();
    
    // Get UI elements
    this.canvasContainer = document.getElementById('three-canvas')!;
    this.charactersContainer = document.getElementById('characters-container')!;
    this.keypointsContainer = document.getElementById('keypoints-container')!;
    this.presetButtonsContainer = document.getElementById('preset-buttons-container')!;

    this.initializeRenderer();
    this.setupEventListeners();
    this.setupUI();
    this.setupAutoSave();
    
    // Try to restore saved state before adding initial character
    this.restoreFromBrowserState();
  }

  private initializeRenderer(): void {
    this.renderer = new ThreeRenderer(this.canvasContainer);
    
    // Set initial movement plane
    this.renderer.setMovementPlane('camera-relative');
  }

  private setupEventListeners(): void {
    // Toolbar buttons
    document.getElementById('add-character')?.addEventListener('click', () => this.addCharacter());
    document.getElementById('clear-all')?.addEventListener('click', () => this.clearAll());
    document.getElementById('export-json')?.addEventListener('click', () => this.exportJSON());
    document.getElementById('import-json')?.addEventListener('click', () => this.importJSON());
    document.getElementById('reset-camera')?.addEventListener('click', () => this.renderer.resetCamera());

    // Undo/Redo buttons
    document.getElementById('undo-btn')?.addEventListener('click', () => this.undo());
    document.getElementById('redo-btn')?.addEventListener('click', () => this.redo());

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', (e) => {
      // Handle undo/redo keyboard shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
      }
    });

    // Camera view buttons
    document.getElementById('view-front')?.addEventListener('click', () => this.renderer.setCameraView('front'));
    document.getElementById('view-back')?.addEventListener('click', () => this.renderer.setCameraView('back'));
    document.getElementById('view-left')?.addEventListener('click', () => this.renderer.setCameraView('left'));
    document.getElementById('view-right')?.addEventListener('click', () => this.renderer.setCameraView('right'));
    document.getElementById('view-top')?.addEventListener('click', () => this.renderer.setCameraView('top'));
    document.getElementById('view-bottom')?.addEventListener('click', () => this.renderer.setCameraView('bottom'));

    // File input
    document.getElementById('file-input')?.addEventListener('change', (e) => this.handleFileImport(e));

    // Preset buttons
    this.presetButtonsContainer.addEventListener('click', (e) => {
      const button = e.target as HTMLButtonElement;
      if (button.classList.contains('preset-btn')) {
        const presetName = button.dataset.preset!;
        this.applyPreset(presetName);
      }
    });

    // Settings
    this.setupSettingsEventListeners();

    // Mouse events for 3D interaction
    this.setupMouseEventListeners();

    // Collapsible panels
    this.setupCollapsiblePanels();
  }

  private setupMouseEventListeners(): void {
    let mouseDownPos = { x: 0, y: 0 };
    let movementMode = 'camera-relative'; // Default to camera-relative movement

    // Track keyboard state for movement mode switching
    let shiftPressed = false;
    let ctrlPressed = false;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') shiftPressed = true;
      if (e.key === 'Control') ctrlPressed = true;
      
      // Add Escape key to manually clear selection (since we made it sticky)
      if (e.key === 'Escape') {
        this.clearSelection();
        return;
      }
      
      // Update movement mode based on modifier keys
      if (shiftPressed && ctrlPressed) {
        movementMode = 'yz'; // Shift+Ctrl: move in YZ plane (side view)
      } else if (shiftPressed) {
        movementMode = 'xz'; // Shift: move in XZ plane (top-down view)
      } else if (ctrlPressed) {
        movementMode = 'xy'; // Ctrl: move in XY plane (front view)
      } else {
        movementMode = 'camera-relative'; // Default: camera-relative movement
      }
      
      this.updatePlaneIndicator(movementMode);
      this.renderer.setMovementPlane(movementMode);
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') shiftPressed = false;
      if (e.key === 'Control') ctrlPressed = false;
      
      // Update movement mode
      if (shiftPressed && ctrlPressed) {
        movementMode = 'yz';
      } else if (shiftPressed) {
        movementMode = 'xz';
      } else if (ctrlPressed) {
        movementMode = 'xy';
      } else {
        movementMode = 'camera-relative';
      }
      this.updatePlaneIndicator(movementMode);
      this.renderer.setMovementPlane(movementMode);
    });

    this.canvasContainer.addEventListener('mousedown', (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
      
      const raycastResult = this.renderer.raycastJoints(e.clientX, e.clientY);
      
      if (raycastResult) {
        // Find the actual character object from our array
        const character = this.characters.find(c => c.id === raycastResult.character.id);
        
        if (character) {
          // Save state for undo before starting drag (will be used when drag ends)
          this.dragStartState = this.getCurrentState();
          
          // Select the joint first
          this.selectJoint(character, raycastResult.jointName);
          
          this.isDragging = true;
          this.dragTarget = {
            character: character,
            jointName: raycastResult.jointName
          };
          
          // Set selected character WITHOUT auto-selecting head
          this.selectedCharacter = character;
          this.updateCharactersList();
          
          // Disable orbit controls while dragging
          this.renderer.getControls().enabled = false;
          e.preventDefault();
          e.stopPropagation();
          
          // Show plane indicator
          this.updatePlaneIndicator(movementMode);
          this.renderer.setMovementPlane(movementMode);
        }
      }
      // Removed: Don't clear selection when clicking empty space - keep selection sticky
    });

    // Add click handler for selection without dragging (useful for just seeing movement axes)
    this.canvasContainer.addEventListener('click', (e) => {
      if (!this.isDragging) {
        const raycastResult = this.renderer.raycastJoints(e.clientX, e.clientY);
        
        if (raycastResult) {
          const character = this.characters.find(c => c.id === raycastResult.character.id);
          if (character) {
            this.selectJoint(character, raycastResult.jointName);
          }
        }
        // Removed: Don't clear selection when clicking empty space - keep selection sticky
      }
    });

    this.canvasContainer.addEventListener('mousemove', (e) => {
      if (this.isDragging && this.dragTarget) {
        // Calculate mouse movement delta
        const deltaX = e.clientX - mouseDownPos.x;
        const deltaY = e.clientY - mouseDownPos.y;
        
        // Calculate world space movement based on movement mode
        let deltaWorld = { x: 0, y: 0, z: 0 };
        
        if (movementMode === 'camera-relative') {
          // Use camera-relative movement (default)
          const joint = this.dragTarget.character.keypoints[this.dragTarget.jointName];
          if (joint) {
            // Calculate distance from camera for proper scaling
            const camera = this.renderer.getCamera();
            const jointPos = new THREE.Vector3(joint.x, joint.y, joint.z);
            const distance = camera.position.distanceTo(jointPos);
            
            // Get camera-relative movement
            const movement = this.renderer.screenToWorldMovement(deltaX, deltaY, distance);
            deltaWorld = {
              x: movement.x,
              y: movement.y,
              z: movement.z
            };
          }
        } else {
          // Use fixed plane movement with better scaling
          const scaleFactor = 0.02;
          
          switch (movementMode) {
            case 'xy': // Front view - X horizontal, Y vertical
              deltaWorld = {
                x: deltaX * scaleFactor,
                y: -deltaY * scaleFactor, // Invert Y for correct direction
                z: 0
              };
              break;
            case 'xz': // Top view - X horizontal, Z depth
              deltaWorld = {
                x: deltaX * scaleFactor,
                y: 0,
                z: deltaY * scaleFactor
              };
              break;
            case 'yz': // Side view - Y vertical, Z depth
              deltaWorld = {
                x: 0,
                y: -deltaY * scaleFactor, // Invert Y for correct direction
                z: deltaX * scaleFactor
              };
              break;
          }
        }

        // Update joint position
        const joint = this.dragTarget.character.keypoints[this.dragTarget.jointName];
        if (joint) {
          const newPosition = {
            x: joint.x + deltaWorld.x,
            y: joint.y + deltaWorld.y,
            z: joint.z + deltaWorld.z
          };

          // Apply constraints
          this.constraintSolver.applyConstraints(this.dragTarget.character, this.dragTarget.jointName, newPosition);
          
          // Update visuals
          this.renderer.updateCharacter(this.dragTarget.character);
          this.updateKeypointsUI();
          
          // Update mouse position for next delta calculation
          mouseDownPos = { x: e.clientX, y: e.clientY };
        }
      }
    });

    this.canvasContainer.addEventListener('mouseup', () => {
      if (this.isDragging) {
        // Re-enable orbit controls when dragging stops
        this.renderer.getControls().enabled = true;
        
        // Save action to history if we actually dragged something
        if (this.dragStartState && this.dragTarget) {
          const jointDisplayName = this.dragTarget.jointName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          
          // Add debugging for joint movement
          console.log(`=== SAVING JOINT MOVEMENT ===`);
          console.log(`Joint: ${jointDisplayName} on Character ${this.dragTarget.character.id}`);
          console.log('Before state characters:', this.dragStartState.characters.map(c => ({ 
            id: c.id, 
            name: c.name,
            headPos: c.keypoints.head 
          })));
          
          const currentState = this.getCurrentState();
          console.log('After state characters:', currentState.characters.map(c => ({ 
            id: c.id, 
            name: c.name,
            headPos: c.keypoints.head 
          })));
          
          this.saveAction('joint-move', `Moved ${jointDisplayName}`, this.dragStartState);
          console.log(`=== END JOINT MOVEMENT SAVE ===`);
        }
      }
      this.isDragging = false;
      this.dragTarget = null;
      this.dragStartState = null;
      this.hidePlaneIndicator();
    });
  }

  private setupSettingsEventListeners(): void {
    const boneThicknessSlider = document.getElementById('bone-thickness') as HTMLInputElement;
    const jointSizeSlider = document.getElementById('joint-size') as HTMLInputElement;
    const gridVisibleCheckbox = document.getElementById('grid-visible') as HTMLInputElement;

    boneThicknessSlider?.addEventListener('input', () => {
      const settings: Partial<SceneSettings> = {
        boneThickness: parseFloat(boneThicknessSlider.value)
      };
      this.renderer.updateSettings(settings);
      // Re-render all characters to apply new bone thickness
      this.characters.forEach(char => this.renderer.updateCharacter(char));
    });

    jointSizeSlider?.addEventListener('input', () => {
      const settings: Partial<SceneSettings> = {
        jointSize: parseFloat(jointSizeSlider.value)
      };
      this.renderer.updateSettings(settings);
      // Re-render all characters to apply new joint size
      this.characters.forEach(char => this.renderer.updateCharacter(char));
    });

    gridVisibleCheckbox?.addEventListener('change', () => {
      const settings: Partial<SceneSettings> = {
        gridVisible: gridVisibleCheckbox.checked
      };
      this.renderer.updateSettings(settings);
    });
  }

  private setupCollapsiblePanels(): void {
    // Setup collapsible functionality for all sidebar panels
    const panels = [
      { toggle: 'presets-toggle', container: 'preset-buttons-container' },
      { toggle: 'characters-toggle', container: 'characters-container' },
      { toggle: 'keypoints-toggle', container: 'keypoints-container' },
      { toggle: 'settings-toggle', container: 'settings-content' },
      { toggle: 'undo-redo-toggle', container: 'undo-redo-content' }
    ];

    panels.forEach(panel => {
      const toggle = document.getElementById(panel.toggle);
      const container = document.getElementById(panel.container);

      toggle?.addEventListener('click', () => {
        container?.classList.toggle('collapsed');
        toggle.classList.toggle('collapsed');
      });
    });
  }

  private setupUI(): void {
    this.updateCharactersList();
    this.updateKeypointsUI();
    this.updateUndoRedoUI();
  }

  private addCharacter(): void {
    // Save state for undo
    const beforeState = this.getCurrentState();
    
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8'];
    const color = colors[this.characters.length % colors.length];
    
    const character: Character = {
      id: this.nextCharacterId++,
      name: `Character ${this.nextCharacterId - 1}`, // Use the actual ID for naming
      color,
      visible: true,
      keypoints: this.deepCloneKeypoints(this.presets.standing) // Use deep clone instead of spread
    };

    // Position new characters with slight offset
    const offset = this.characters.length * 2;
    Object.keys(character.keypoints).forEach(jointName => {
      character.keypoints[jointName].x += offset;
    });

    this.characters.push(character);
    this.constraintSolver.calculateBoneLengthsFromCharacter(character);
    this.renderer.addCharacter(character);
    this.selectCharacter(character);
    this.updateCharactersList();
    
    // Save action to history
    this.saveAction('character-add', `Added ${character.name}`, beforeState);
    
    this.showMessage('Character added!', 'success');
    this.stateManager.markDirty();
    
    console.log(`Added character with ID ${character.id}. Total characters: ${this.characters.length}`);
  }

  private clearAll(): void {
    // Save state for undo
    const beforeState = this.getCurrentState();
    
    this.renderer.clearJointHighlight(); // Clear any joint highlights
    
    this.characters.forEach(char => this.renderer.removeCharacter(char));
    this.characters = [];
    this.selectedCharacter = null;
    this.selectedJoint = null;
    this.updateCharactersList();
    this.updateKeypointsUI();
    
    // Save action to history
    this.saveAction('clear-all', 'Cleared all characters', beforeState);
    
    this.showMessage('All characters cleared!', 'info');
    this.stateManager.markDirty();
  }

  private selectCharacter(character: Character): void {
    this.selectedCharacter = character;
    
    // Also select the head joint by default for immediate visual feedback
    this.selectJoint(character, 'head');
    
    this.updateCharactersList();
    this.updateKeypointsUI();
    this.stateManager.markDirty();
  }

  private selectJoint(character: Character, jointName: string): void {
    // Clear any previous highlight first
    this.renderer.clearJointHighlight();
    
    this.selectedCharacter = character;
    this.selectedJoint = jointName;
    
    console.log(`Selected joint: ${jointName} on character ${character.id}`);
    
    // Show helpful message on first selection
    if (!this.hasShownSelectionHelp) {
      this.showMessage('Joint selected! Selection is sticky - press Escape to clear, or select another joint.', 'info');
      this.hasShownSelectionHelp = true;
    }
    
    // Update visual indicators
    this.updateJointSelectionVisual(character, jointName);
    this.showMovementAxisIndicator(character, jointName);
    this.stateManager.markDirty();
  }

  private updateJointSelectionVisual(character: Character, jointName: string): void {
    // Add visual highlight to selected joint through renderer
    this.renderer.highlightJoint(character.id, jointName);
  }

  private showMovementAxisIndicator(_character: Character, jointName: string): void {
    // Remove existing indicator
    const existingIndicator = document.getElementById('movement-axis-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }

    // Create movement axis indicator
    const indicator = document.createElement('div');
    indicator.id = 'movement-axis-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 15px 20px;
      border-radius: 10px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      z-index: 1000;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      border: 2px solid #00ff88;
      max-width: 300px;
      line-height: 1.4;
    `;
    
    const jointDisplayName = jointName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    
    indicator.innerHTML = `
      <div style="font-weight: bold; color: #00ff88; margin-bottom: 8px;">
        📍 Selected: ${jointDisplayName}
      </div>
      <div style="margin-bottom: 6px;">
        <span style="color: #88ccff;">🎯 Default:</span> Camera-relative movement
      </div>
      <div style="margin-bottom: 6px;">
        <span style="color: #ffaa44;">⌨️ Ctrl:</span> XY plane (front/back)
      </div>
      <div style="margin-bottom: 6px;">
        <span style="color: #ffaa44;">⌨️ Shift:</span> XZ plane (top/bottom)
      </div>
      <div>
        <span style="color: #ffaa44;">⌨️ Shift+Ctrl:</span> YZ plane (side)
      </div>
    `;
    
    document.body.appendChild(indicator);
    
    // Removed: Auto-hide functionality - keep selection box always visible
  }

  private hideMovementAxisIndicator(): void {
    const indicator = document.getElementById('movement-axis-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  private clearSelection(): void {
    this.renderer.clearJointHighlight();
    this.hideMovementAxisIndicator();
    this.selectedCharacter = null;
    this.selectedJoint = null;
    this.showMessage('Selection cleared', 'info');
    console.log('Selection cleared manually (Escape key)');
  }

  // Undo/Redo functionality
  private deepCloneKeypoints(keypoints: Record<string, { x: number; y: number; z: number }>): Record<string, { x: number; y: number; z: number }> {
    const cloned: Record<string, { x: number; y: number; z: number }> = {};
    for (const [key, value] of Object.entries(keypoints)) {
      cloned[key] = { 
        x: Number(value.x), 
        y: Number(value.y), 
        z: Number(value.z) 
      };
    }
    return cloned;
  }

  private getCurrentState(): AppState {
    const state = {
      characters: this.characters.map(char => ({
        id: char.id,
        name: char.name,
        color: char.color,
        visible: char.visible,
        keypoints: this.deepCloneKeypoints(char.keypoints)
      })),
      selectedCharacterId: this.selectedCharacter?.id || null,
      selectedJoint: this.selectedJoint,
      nextCharacterId: this.nextCharacterId
    };
    
    // Add debugging for state capture
    console.log('Capturing current state:', {
      characterCount: state.characters.length,
      characters: state.characters.map(c => ({ 
        id: c.id, 
        name: c.name,
        headPos: c.keypoints.head 
      }))
    });
    
    return state;
  }

  private restoreState(state: AppState): void {
    console.log('=== RESTORING STATE ===');
    console.log('Current state before restore:', {
      characters: this.characters.map(c => ({ id: c.id, name: c.name })),
      nextCharacterId: this.nextCharacterId
    });
    console.log('Target state to restore:', {
      characters: state.characters.map(c => ({ id: c.id, name: c.name })),
      nextCharacterId: state.nextCharacterId
    });
    
    // Clear current visual state
    this.renderer.clearJointHighlight();
    this.hideMovementAxisIndicator();
    
    // Remove all current characters from renderer
    this.characters.forEach(char => this.renderer.removeCharacter(char));
    
    // Deep clone the state to avoid reference issues
    this.characters = state.characters.map(char => ({
      id: char.id,
      name: char.name,
      color: char.color,
      visible: char.visible,
      keypoints: this.deepCloneKeypoints(char.keypoints)
    }));
    this.nextCharacterId = state.nextCharacterId;
    
    // Re-add all characters to renderer
    this.characters.forEach(char => {
      this.constraintSolver.calculateBoneLengthsFromCharacter(char);
      this.renderer.addCharacter(char);
    });
    
    // Restore selection
    this.selectedCharacter = state.selectedCharacterId 
      ? this.characters.find(c => c.id === state.selectedCharacterId) || null
      : null;
    this.selectedJoint = state.selectedJoint;
    
    // Update UI
    this.updateCharactersList();
    this.updateKeypointsUI();
    this.updateUndoRedoUI();
    
    // Restore visual selection if needed
    if (this.selectedCharacter && this.selectedJoint) {
      this.updateJointSelectionVisual(this.selectedCharacter, this.selectedJoint);
      this.showMovementAxisIndicator(this.selectedCharacter, this.selectedJoint);
    }
    
    console.log('State restored successfully:', {
      characters: this.characters.map(c => ({ id: c.id, name: c.name })),
      nextCharacterId: this.nextCharacterId
    });
    console.log('=== END RESTORE ===');
  }

  private saveAction(type: Parameters<UndoRedoManager['saveState']>[0], description: string, beforeState: AppState): void {
    const afterState = this.getCurrentState();
    console.log(`Saving action: ${description}`);
    console.log('Before state:', beforeState);
    console.log('After state:', afterState);
    this.undoRedoManager.saveState(type, description, beforeState, afterState);
    this.updateUndoRedoUI();
  }

  private undo(): void {
    const state = this.undoRedoManager.undo();
    if (state) {
      console.log('Undoing to state:', state);
      this.restoreState(state);
      this.showMessage('Undone', 'info');
    } else {
      console.log('Cannot undo - no previous state');
    }
  }

  private redo(): void {
    const state = this.undoRedoManager.redo();
    if (state) {
      console.log('Redoing to state:', state);
      this.restoreState(state);
      this.showMessage('Redone', 'info');
    } else {
      console.log('Cannot redo - no next state');
    }
  }

  private jumpToHistoryAction(actionId: string): void {
    const state = this.undoRedoManager.jumpToAction(actionId);
    if (state) {
      this.restoreState(state);
      this.showMessage('Jumped to action', 'info');
    }
  }

  private updateUndoRedoUI(): void {
    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement;
    const redoBtn = document.getElementById('redo-btn') as HTMLButtonElement;
    const historyList = document.getElementById('history-list')!;

    // Update button states
    if (undoBtn) {
      undoBtn.disabled = !this.undoRedoManager.canUndo();
    }
    if (redoBtn) {
      redoBtn.disabled = !this.undoRedoManager.canRedo();
    }

    // Update history list
    const history = this.undoRedoManager.getHistory();
    const currentIndex = this.undoRedoManager.getCurrentIndex();

    console.log(`History update: ${history.length} items, current index: ${currentIndex}`);

    if (history.length === 0) {
      historyList.innerHTML = '<p class="no-history">No actions yet</p>';
    } else {
      historyList.innerHTML = history.map((action, index) => {
        const date = new Date(action.timestamp);
        const timeStr = date.toLocaleTimeString();
        
        let className = 'history-item';
        if (index === currentIndex) {
          className += ' current';
        } else if (index > currentIndex) {
          className += ' future';
        }

        // Show character counts for better debugging
        const beforeCount = action.beforeState.characters.length;
        const afterCount = action.afterState.characters.length;
        const debugInfo = `(${beforeCount}→${afterCount})`;

        return `
          <div class="${className}" data-action-id="${action.id}">
            <span>${action.description} ${debugInfo}</span>
            <span class="history-item-time">${timeStr}</span>
          </div>
        `;
      }).join('');

      // Add click handlers to history items
      historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
          const actionId = (item as HTMLElement).dataset.actionId!;
          this.jumpToHistoryAction(actionId);
        });
      });
    }
  }

  // Missing methods implementation
  private updateKeypointsUI(): void {
    if (!this.keypointsContainer) return;
    
    if (!this.selectedCharacter) {
      this.keypointsContainer.innerHTML = '<p>Select a character to edit keypoints</p>';
      return;
    }

    // Simple display of current character's keypoints
    const keypointsHtml = Object.entries(this.selectedCharacter.keypoints)
      .map(([jointName, position]) => `
        <div class="keypoint-item">
          <span>${jointName}:</span>
          <span>x:${position.x.toFixed(2)} y:${position.y.toFixed(2)} z:${position.z.toFixed(2)}</span>
        </div>
      `).join('');
    
    this.keypointsContainer.innerHTML = `
      <h4>${this.selectedCharacter.name} Keypoints</h4>
      ${keypointsHtml}
    `;
  }

  private updateCharactersList(): void {
    if (!this.charactersContainer) return;
    
    console.log(`Updating characters list: ${this.characters.length} characters`);
    this.characters.forEach(char => {
      console.log(`  Character ${char.id}: ${char.name}`);
    });
    
    if (this.characters.length === 0) {
      this.charactersContainer.innerHTML = '<p>No characters created yet</p>';
      return;
    }

    const charactersHtml = this.characters.map(char => `
      <div class="character-item ${char === this.selectedCharacter ? 'selected' : ''}" data-character-id="${char.id}">
        <div class="character-color" style="background-color: ${char.color}"></div>
        <span>${char.name}</span>
        <button class="delete-char-btn" data-character-id="${char.id}">×</button>
      </div>
    `).join('');
    
    this.charactersContainer.innerHTML = charactersHtml;
    
    // Add click handlers
    this.charactersContainer.querySelectorAll('.character-item').forEach(item => {
      item.addEventListener('click', () => {
        const charId = parseInt((item as HTMLElement).dataset.characterId!);
        const character = this.characters.find(c => c.id === charId);
        if (character) {
          this.selectCharacter(character);
        }
      });
    });

    // Add toggle visibility handlers
    this.charactersContainer.querySelectorAll('.toggle-visibility').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const charId = parseInt((button as HTMLButtonElement).dataset.characterId!);
        const character = this.characters.find(c => c.id === charId);
        if (character) {
          this.toggleCharacterVisibility(character);
        }
      });
    });

    // Add delete handlers
    this.charactersContainer.querySelectorAll('.delete-character').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const charId = parseInt((button as HTMLButtonElement).dataset.characterId!);
        this.deleteCharacter(charId);
      });
    });
  }

  private restoreFromBrowserState(): void {
    const savedState = this.stateManager.loadState();
    if (savedState) {
      console.log('Restoring app state from browser storage');
      
      // Restore characters
      this.characters = savedState.characters;
      this.nextCharacterId = savedState.nextCharacterId;
      
      // Restore camera
      this.renderer.setCameraState(savedState.cameraState);
      
      // Restore scene settings
      this.renderer.updateSceneSettings(savedState.sceneSettings);
      
      // Restore selection
      if (savedState.selectedCharacterId) {
        this.selectedCharacter = this.characters.find(c => c.id === savedState.selectedCharacterId) || null;
      }
      this.selectedJoint = savedState.selectedJoint;
      
      // Render all characters
      this.characters.forEach(character => {
        this.renderer.addCharacter(character);
      });
      
      // Update UI
      this.updateCharactersList();
      this.updateKeypointsUI();
      
      console.log('State restored successfully');
    } else {
      // No saved state, add initial character
      this.addCharacter();
    }
  }

  private saveToBrowserState(): void {
    const cameraState = this.renderer.getCameraState();
    const sceneSettings = this.renderer.getSceneSettings();
    
    this.stateManager.saveState(
      this.characters,
      this.selectedCharacter?.id || null,
      this.selectedJoint,
      this.nextCharacterId,
      cameraState,
      sceneSettings
    );
  }

  private setupAutoSave(): void {
    // Listen for auto-save events
    document.addEventListener('poser3d-auto-save', () => {
      this.saveToBrowserState();
    });
    
    // We'll manually trigger markDirty() in key methods
  }

  private exportJSON(): void {
    try {
      const stateJson = this.stateManager.exportStateAsJSON();
      const blob = new Blob([stateJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `poser3d-state-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showMessage('State exported successfully!', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      this.showMessage('Export failed', 'error');
    }
  }

  private importJSON(): void {
    const input = document.getElementById('file-input') as HTMLInputElement;
    input.click();
  }

  private handleFileImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const state = this.stateManager.importStateFromJSON(content);
        
        // Clear current state
        this.clearAll();
        
        // Restore from imported state
        this.characters = state.characters;
        this.nextCharacterId = state.nextCharacterId;
        this.renderer.setCameraState(state.cameraState);
        this.renderer.updateSceneSettings(state.sceneSettings);
        
        // Render characters
        this.characters.forEach(character => {
          this.renderer.addCharacter(character);
        });
        
        // Update UI
        this.updateCharactersList();
        this.updateKeypointsUI();
        
        this.showMessage('State imported successfully!', 'success');
      } catch (error) {
        console.error('Import failed:', error);
        this.showMessage('Import failed - invalid file format', 'error');
      }
    };
    reader.readAsText(file);
  }

  private applyPreset(presetName: string): void {
    if (!this.selectedCharacter) {
      this.showMessage('Please select a character first', 'warning');
      return;
    }

    const beforeState = this.getCurrentState();
    
    if (this.presets[presetName]) {
      this.selectedCharacter.keypoints = { ...this.presets[presetName] };
      this.renderer.updateCharacter(this.selectedCharacter);
      this.updateKeypointsUI();
      
      const afterState = this.getCurrentState();
      this.undoRedoManager.saveState(
        'preset-apply',
        `Apply ${presetName} preset`,
        beforeState,
        afterState
      );
      
      this.updateUndoRedoUI();
      this.showMessage(`Applied ${presetName} preset`, 'success');
      this.stateManager.markDirty();
    }
  }

  private showMessage(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
    // Simple message display - you can enhance this with a proper toast system
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Create or update a simple message element
    let messageEl = document.getElementById('message-display');
    if (!messageEl) {
      messageEl = document.createElement('div');
      messageEl.id = 'message-display';
      messageEl.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 1000;
        max-width: 300px;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(messageEl);
    }
    
    // Set message style based on type
    const colors = {
      success: 'background: #4caf50; color: white;',
      error: 'background: #f44336; color: white;',
      warning: 'background: #ff9800; color: white;',
      info: 'background: #2196f3; color: white;'
    };
    
    messageEl.style.cssText += colors[type];
    messageEl.textContent = message;
    messageEl.style.display = 'block';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      messageEl!.style.display = 'none';
    }, 3000);
  }

  private updatePlaneIndicator(movementMode: string): void {
    // Update movement plane indicator in the UI
    const indicator = document.getElementById('plane-indicator');
    if (indicator) {
      indicator.textContent = `Movement: ${movementMode}`;
    }
  }

  private hidePlaneIndicator(): void {
    const indicator = document.getElementById('plane-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  private toggleCharacterVisibility(character: Character): void {
    character.visible = !character.visible;
    this.renderer.updateCharacter(character);
    this.updateCharactersList();
    this.stateManager.markDirty();
  }

  private deleteCharacter(characterId: number): void {
    const characterIndex = this.characters.findIndex(c => c.id === characterId);
    if (characterIndex === -1) return;

    const beforeState = this.getCurrentState();
    
    // Remove character from array
    this.characters.splice(characterIndex, 1);
    
    // Remove from renderer
    const character = this.characters.find(c => c.id === characterId);
    if (character) {
      this.renderer.removeCharacter(character);
    }
    
    // Clear selection if this character was selected
    if (this.selectedCharacter?.id === characterId) {
      this.selectedCharacter = null;
      this.selectedJoint = null;
    }
    
    // Update UI
    this.updateCharactersList();
    this.updateKeypointsUI();
    
    const afterState = this.getCurrentState();
    this.undoRedoManager.saveState(
      'character-delete',
      `Delete character ${characterId}`,
      beforeState,
      afterState
    );
    
    this.updateUndoRedoUI();
    this.stateManager.markDirty();
  }
}

// Initialize the app
new StickFigureApp3D();
