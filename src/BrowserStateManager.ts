import type { Character, AppState, SceneSettings, GLTFModelSettings } from './types';
import * as THREE from 'three';

export interface CameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  zoom: number;
}

export interface FullAppState extends AppState {
  cameraState: CameraState;
  sceneSettings: SceneSettings;
  timestamp: number;
  version: string;
  currentModelPath?: string;
  modelSettings?: GLTFModelSettings;
}

export class BrowserStateManager {
  private static readonly STORAGE_KEY = 'poser3d-app-state';
  private static readonly VERSION = '1.0.0';
  private static readonly AUTO_SAVE_INTERVAL = 2000; // Auto-save every 2 seconds
  
  private autoSaveTimer: number | null = null;
  private lastSaveTime = 0;
  private pendingChanges = false;

  constructor() {
    // Set up auto-save
    this.startAutoSave();
    
    // Save state when page is about to unload
    window.addEventListener('beforeunload', () => {
      this.stopAutoSave();
    });
    
    // Handle visibility changes to save when tab becomes hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.pendingChanges) {
        this.forceSave();
      }
    });
  }

  /**
   * Save the current app state to localStorage
   */
  public saveState(
    characters: Character[],
    selectedCharacterId: number | null,
    selectedJoint: string | null,
    nextCharacterId: number,
    cameraState: CameraState,
    sceneSettings: SceneSettings,
    currentModelPath?: string,
    modelSettings?: GLTFModelSettings
  ): void {
    try {
      const fullState: FullAppState = {
        characters: this.cloneCharacters(characters),
        selectedCharacterId,
        selectedJoint,
        nextCharacterId,
        cameraState: { ...cameraState },
        sceneSettings: { ...sceneSettings },
        timestamp: Date.now(),
        version: BrowserStateManager.VERSION,
        currentModelPath,
        modelSettings: modelSettings ? { ...modelSettings } : undefined
      };

      const serialized = JSON.stringify(fullState);
      localStorage.setItem(BrowserStateManager.STORAGE_KEY, serialized);
      
      this.lastSaveTime = Date.now();
      this.pendingChanges = false;
      
      console.log('State saved to localStorage:', {
        characters: characters.length,
        timestamp: new Date(fullState.timestamp).toLocaleTimeString()
      });
    } catch (error) {
      console.error('Failed to save state to localStorage:', error);
    }
  }

  /**
   * Load the app state from localStorage
   */
  public loadState(): FullAppState | null {
    try {
      const serialized = localStorage.getItem(BrowserStateManager.STORAGE_KEY);
      if (!serialized) {
        console.log('No saved state found in localStorage');
        return null;
      }

      const state = JSON.parse(serialized) as FullAppState;
      
      // Validate the state structure
      if (!this.isValidState(state)) {
        console.warn('Invalid state structure found, ignoring saved state');
        return null;
      }

      // Check version compatibility
      if (state.version !== BrowserStateManager.VERSION) {
        console.warn(`State version mismatch (saved: ${state.version}, current: ${BrowserStateManager.VERSION}), attempting migration`);
        // In the future, we could add migration logic here
      }

      console.log('State loaded from localStorage:', {
        characters: state.characters.length,
        savedAt: new Date(state.timestamp).toLocaleTimeString()
      });

      return state;
    } catch (error) {
      console.error('Failed to load state from localStorage:', error);
      return null;
    }
  }

  /**
   * Clear the saved state
   */
  public clearState(): void {
    try {
      localStorage.removeItem(BrowserStateManager.STORAGE_KEY);
      console.log('Saved state cleared from localStorage');
    } catch (error) {
      console.error('Failed to clear state from localStorage:', error);
    }
  }

  /**
   * Check if there's a saved state available
   */
  public hasSavedState(): boolean {
    return localStorage.getItem(BrowserStateManager.STORAGE_KEY) !== null;
  }

  /**
   * Mark that changes have been made and need to be saved
   */
  public markDirty(): void {
    this.pendingChanges = true;
  }

  /**
   * Get the age of the last saved state in milliseconds
   */
  public getStateAge(): number {
    if (this.lastSaveTime === 0) {
      return 0;
    }
    return Date.now() - this.lastSaveTime;
  }

  /**
   * Force an immediate save (used for critical moments)
   */
  public forceSave(): void {
    // This will be called by the main app when needed
    this.pendingChanges = true;
  }

  private startAutoSave(): void {
    this.autoSaveTimer = window.setInterval(() => {
      if (this.pendingChanges) {
        // The main app will handle the actual saving
        // This just marks that auto-save should happen
        document.dispatchEvent(new CustomEvent('poser3d-auto-save'));
      }
    }, BrowserStateManager.AUTO_SAVE_INTERVAL);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      window.clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private isValidState(state: any): state is FullAppState {
    return (
      state &&
      typeof state === 'object' &&
      Array.isArray(state.characters) &&
      typeof state.nextCharacterId === 'number' &&
      state.cameraState &&
      typeof state.cameraState.position === 'object' &&
      typeof state.cameraState.target === 'object' &&
      typeof state.cameraState.zoom === 'number' &&
      state.sceneSettings &&
      typeof state.sceneSettings.boneThickness === 'number' &&
      typeof state.sceneSettings.jointSize === 'number' &&
      typeof state.sceneSettings.gridVisible === 'boolean' &&
      typeof state.timestamp === 'number' &&
      typeof state.version === 'string' &&
      // New fields are optional for backwards compatibility
      (state.currentModelPath === undefined || typeof state.currentModelPath === 'string') &&
      (state.modelSettings === undefined || typeof state.modelSettings === 'object')
    );
  }

  private cloneCharacters(characters: Character[]): Character[] {
    return characters.map(char => ({
      id: char.id,
      name: char.name,
      color: char.color,
      visible: char.visible,
      keypoints: this.deepCloneKeypoints(char.keypoints),
      modelPath: char.modelPath,
      boneRotations: char.boneRotations ? this.deepCloneBoneRotations(char.boneRotations) : undefined
    }));
  }

  private deepCloneKeypoints(keypoints: Record<string, any>): Record<string, any> {
    const cloned: Record<string, any> = {};
    for (const [key, value] of Object.entries(keypoints)) {
      cloned[key] = {
        x: Number(value.x),
        y: Number(value.y),
        z: Number(value.z)
      };
    }
    return cloned;
  }

  private deepCloneBoneRotations(boneRotations: Record<string, THREE.Euler>): Record<string, any> {
    const cloned: Record<string, any> = {};
    for (const [key, value] of Object.entries(boneRotations)) {
      // Convert THREE.Euler to plain object for JSON serialization
      cloned[key] = {
        x: value.x,
        y: value.y,
        z: value.z,
        order: value.order
      };
    }
    return cloned;
  }

  /**
   * Export state as JSON for manual backup/sharing
   */
  public exportStateAsJSON(): string {
    const state = this.loadState();
    if (!state) {
      throw new Error('No state to export');
    }
    return JSON.stringify(state, null, 2);
  }

  /**
   * Import state from JSON
   */
  public importStateFromJSON(jsonString: string): FullAppState {
    const state = JSON.parse(jsonString) as FullAppState;
    if (!this.isValidState(state)) {
      throw new Error('Invalid state format');
    }
    return state;
  }
}
