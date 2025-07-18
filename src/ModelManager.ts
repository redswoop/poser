import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character3D } from './Character3D';
import { GLTFBoneController } from './GLTFBoneController';
import type { GLTFModelSettings } from './types';

export interface LoadedModelData {
  gltfModel: THREE.Group;
  skeleton: THREE.Skeleton;
  skinnedMesh: THREE.SkinnedMesh;
  boneController: GLTFBoneController;
  path: string;
  loadedAt: Date;
}

export interface ModelLoadResult {
  character: Character3D;
  success: boolean;
  error?: string;
}

export class ModelManager extends EventTarget {
  private loader: GLTFLoader;
  private loadedModels: Map<string, LoadedModelData> = new Map();
  private currentCharacter: Character3D | null = null;
  private isLoading: boolean = false;
  private renderer: any;
  
  // Default model paths in priority order
  private defaultModelPaths: string[] = ['/woman.glb', '/oro.glb', '/dummy.glb'];
  
  constructor(renderer: any) {
    super();
    this.renderer = renderer;
    this.loader = new GLTFLoader();
  }

  /**
   * Load a model from a specific path and create a Character3D instance
   */
  public async loadModel(modelPath: string, preserveSettings: boolean = false): Promise<ModelLoadResult> {
    console.log(`🎭 ModelManager: Loading model from ${modelPath}`);
    
    if (this.isLoading) {
      console.warn('⚠️ ModelManager: Already loading a model, please wait');
      return { character: new Character3D(), success: false, error: 'Already loading' };
    }

    this.isLoading = true;
    this.dispatchEvent(new CustomEvent('loading-started', { detail: { path: modelPath } }));

    try {
      // Check cache first
      let modelData = this.loadedModels.get(modelPath);
      
      if (!modelData) {
        console.log(`📥 Loading new model: ${modelPath}`);
        modelData = await this.loadGLTFModel(modelPath);
        this.loadedModels.set(modelPath, modelData);
      } else {
        console.log(`♻️ Using cached model: ${modelPath}`);
      }

      // Create character instance
      const character = this.createCharacterFromModel(modelData, preserveSettings);
      this.currentCharacter = character;

      // Notify renderer to set up the model
      await this.setupModelInRenderer(modelData);

      console.log(`✅ ModelManager: Successfully loaded ${modelPath}`);
      this.dispatchEvent(new CustomEvent('model-loaded', { 
        detail: { character, path: modelPath } 
      }));

      return { character, success: true };

    } catch (error) {
      console.error(`❌ ModelManager: Failed to load ${modelPath}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.dispatchEvent(new CustomEvent('model-load-failed', { 
        detail: { path: modelPath, error: errorMessage } 
      }));

      return { 
        character: new Character3D(), 
        success: false, 
        error: errorMessage 
      };
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load the default model (tries multiple fallbacks)
   */
  public async loadDefaultModel(): Promise<ModelLoadResult> {
    console.log('🎭 ModelManager: Loading default model...');

    for (const defaultPath of this.defaultModelPaths) {
      console.log(`🔍 Trying default model: ${defaultPath}`);
      
      const result = await this.loadModel(defaultPath);
      
      if (result.success) {
        console.log(`✅ Default model loaded successfully: ${defaultPath}`);
        
        // Focus camera on the loaded model
        if (this.renderer && this.renderer.focusOnGLTFModel) {
          this.renderer.focusOnGLTFModel();
        }
        
        return result;
      } else {
        console.warn(`⚠️ Default model failed: ${defaultPath}, trying next...`);
      }
    }

    console.error('❌ All default models failed to load');
    return { 
      character: new Character3D(), 
      success: false, 
      error: 'All default models failed to load' 
    };
  }

  /**
   * Get the currently loaded character
   */
  public getCurrentCharacter(): Character3D | null {
    return this.currentCharacter;
  }

  /**
   * Check if a model is currently loading
   */
  public isModelLoading(): boolean {
    return this.isLoading;
  }

  /**
   * Get available cached models
   */
  public getCachedModelPaths(): string[] {
    return Array.from(this.loadedModels.keys());
  }

  /**
   * Clear the model cache
   */
  public clearCache(): void {
    console.log('🧹 ModelManager: Clearing model cache');
    this.loadedModels.clear();
  }

  /**
   * Validate if a model has the required components
   */
  public validateModel(gltf: any): { valid: boolean; skeleton?: THREE.Skeleton; skinnedMesh?: THREE.SkinnedMesh } {
    let skeleton: THREE.Skeleton | null = null;
    let skinnedMesh: THREE.SkinnedMesh | null = null;

    // Find skeleton and skinned mesh
    gltf.scene.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.SkinnedMesh) {
        skinnedMesh = child;
        if (child.skeleton) {
          skeleton = child.skeleton;
        }
      }
    });

    const valid = skeleton !== null && skinnedMesh !== null;
    
    if (!valid) {
      console.warn('⚠️ Model validation failed: missing skeleton or skinned mesh');
    }

    return { valid, skeleton: skeleton || undefined, skinnedMesh: skinnedMesh || undefined };
  }

  /**
   * Load GLTF model from file system
   */
  private async loadGLTFModel(modelPath: string): Promise<LoadedModelData> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        modelPath,
        (gltf) => {
          console.log(`📦 GLTF loaded: ${modelPath}`);
          
          // Validate the model
          const validation = this.validateModel(gltf);
          if (!validation.valid) {
            reject(new Error(`Invalid model: missing skeleton or skinned mesh`));
            return;
          }

          // Create bone controller
          const boneController = new GLTFBoneController(
            gltf.scene as any, // Cast to any since GLTFBoneController expects Scene but works with Group
            validation.skeleton!,
            validation.skinnedMesh!
          );

          const modelData: LoadedModelData = {
            gltfModel: gltf.scene,
            skeleton: validation.skeleton!,
            skinnedMesh: validation.skinnedMesh!,
            boneController,
            path: modelPath,
            loadedAt: new Date()
          };

          resolve(modelData);
        },
        (progress) => {
          console.log(`📈 Loading progress: ${(progress.loaded / progress.total * 100).toFixed(1)}%`);
        },
        (error) => {
          console.error(`❌ GLTF load error for ${modelPath}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Create a Character3D instance from loaded model data
   */
  private createCharacterFromModel(modelData: LoadedModelData, preserveSettings: boolean): Character3D {
    const character = new Character3D(modelData.path);
    
    // Set up the model in the character
    character.setModel(modelData.gltfModel, modelData.skeleton, modelData.skinnedMesh);
    character.setBoneController(modelData.boneController);

    // Apply default settings if not preserving
    if (!preserveSettings) {
      const defaultSettings: GLTFModelSettings = {
        showModel: true,
        modelOpacity: 1.0,
        modelScale: 1.0,
        modelPath: modelData.path
      };
      character.updateSettings(defaultSettings);
    }

    return character;
  }

  /**
   * Set up the loaded model in the renderer
   */
  private async setupModelInRenderer(modelData: LoadedModelData): Promise<void> {
    if (!this.renderer || !this.renderer.loadGLTFModel) {
      console.warn('⚠️ Renderer not available or missing loadGLTFModel method');
      return;
    }

    try {
      // The renderer should handle adding the model to the scene
      await this.renderer.loadGLTFModel(modelData.path);
      console.log('✅ Model set up in renderer');
    } catch (error) {
      console.error('❌ Failed to set up model in renderer:', error);
      throw error;
    }
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    console.log('🧹 ModelManager: Disposing resources');
    this.clearCache();
    this.currentCharacter = null;
    this.isLoading = false;
  }
}
