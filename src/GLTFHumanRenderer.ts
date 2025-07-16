import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFBoneController } from './GLTFBoneController';

export interface GLTFModelSettings {
  showModel: boolean;
  modelOpacity: number;
  modelScale: number;
  modelPath: string;
}

export class GLTFHumanRenderer {
  private scene: THREE.Scene;
  private loader: GLTFLoader;
  public model: THREE.Group | null = null;
  public boneController: GLTFBoneController | null = null;
  
  private settings: GLTFModelSettings = {
    showModel: true,
    modelOpacity: 1.0,
    modelScale: 1.0,
    modelPath: ''
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
  }

  public async loadModel(modelPath: string): Promise<void> {
    console.log(`Loading new GLTF model from: ${modelPath}`);
    
    // Clear any existing model
    this.clear();
    
    try {
      const gltf = await this.loader.loadAsync(modelPath);
      this.model = gltf.scene;
      this.settings.modelPath = modelPath;
      
      console.log(`📦 Model loaded:`, this.model);
      console.log(`📦 Model children:`, this.model.children.length);
      
      // Scale and position the model
      this.setupModelProperties(this.model);
      
      let skeleton: THREE.Skeleton | null = null;
      let skinnedMesh: THREE.SkinnedMesh | null = null;
      this.model.traverse((child) => {
        console.log(`🔍 Checking child:`, child.type, child.name);
        if (child instanceof THREE.SkinnedMesh) {
          skeleton = child.skeleton;
          skinnedMesh = child;
          console.log(`✅ Found skeleton with ${skeleton.bones.length} bones.`);
        }
      });

      if (skeleton && skinnedMesh) {
        this.boneController = new GLTFBoneController(this.scene, skeleton, skinnedMesh);
        
        // Apply current scale to bone controls
        this.boneController.setScale(this.settings.modelScale);
        
        // Fire an event to let the main app know the controls are ready
        const event = new CustomEvent('gltfControlsReady', {
          detail: { controls: this.boneController.controls }
        });
        window.dispatchEvent(event);

      } else {
        console.error('⚠️ No skeleton or skinned mesh found in the GLTF model.');
      }

      this.scene.add(this.model);
      console.log(`✅ Model added to scene. Model visible: ${this.model.visible}`);
      console.log(`✅ Model position: x=${this.model.position.x}, y=${this.model.position.y}, z=${this.model.position.z}`);
      console.log(`✅ Model scale: x=${this.model.scale.x}, y=${this.model.scale.y}, z=${this.model.scale.z}`);
      
      // Calculate bounding box for debugging
      const box = new THREE.Box3().setFromObject(this.model);
      console.log(`✅ Model bounding box: min=(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}) max=(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)})`);
      console.log(`✅ Model bounding box size: width=${(box.max.x - box.min.x).toFixed(2)}, height=${(box.max.y - box.min.y).toFixed(2)}, depth=${(box.max.z - box.min.z).toFixed(2)}`);
      
      // Check if model has any actual geometry
      let hasGeometry = false;
      this.model.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
          hasGeometry = true;
          console.log(`🔍 Found mesh: ${child.name || 'unnamed'} - visible: ${child.visible}, material: ${child.material ? 'has material' : 'no material'}`);
        }
      });
      console.log(`✅ Model has geometry: ${hasGeometry}`);

    } catch (error) {
      console.error('Error loading glTF model:', error);
      throw error;
    }
  }

  private setupModelProperties(model: THREE.Group): void {
    console.log('🔧 Setting up model properties...');
    
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    
    console.log(`📏 Original model size: width=${size.x.toFixed(2)}, height=${size.y.toFixed(2)}, depth=${size.z.toFixed(2)}`);
    console.log(`📏 Original max dimension: ${maxDimension.toFixed(2)}`);
    
    // Make the model bigger and more visible
    const targetHeight = 3.0; // Reduced from 5.0 to make it more visible
    const scale = targetHeight / maxDimension;
    
    console.log(`🔄 Applying scale: ${scale.toFixed(2)} (target height: ${targetHeight})`);
    
    model.scale.setScalar(scale);
    
    const center = box.getCenter(new THREE.Vector3());
    // Position the model so its feet are on the ground (y=0)
    const newPosition = { x: 0, y: -box.min.y * scale, z: 0 };
    model.position.set(newPosition.x, newPosition.y, newPosition.z);
    
    console.log(`📍 Original center: x=${center.x.toFixed(2)}, y=${center.y.toFixed(2)}, z=${center.z.toFixed(2)}`);
    console.log(`📍 Original min: x=${box.min.x.toFixed(2)}, y=${box.min.y.toFixed(2)}, z=${box.min.z.toFixed(2)}`);
    console.log(`📍 New position: x=${newPosition.x.toFixed(2)}, y=${newPosition.y.toFixed(2)}, z=${newPosition.z.toFixed(2)}`);
    
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Ensure materials are properly set up
        if (child.material) {
          const material = child.material as THREE.MeshStandardMaterial;
          material.transparent = true;
          material.opacity = 1.0;
          
          // Improve lighting response
          material.metalness = 0.1;
          material.roughness = 0.7;
          
          // Add wireframe for debugging
          console.log(`🎨 Setting up material for mesh: ${child.name || 'unnamed'}`);
          console.log(`🎨 Material type: ${material.type}`);
          console.log(`🎨 Material color: ${material.color ? material.color.getHexString() : 'none'}`);
          
          // Ensure material is visible with a brighter color
          if (material.color) {
            material.color.setHex(0xCC9966); // Lighter brown color for better visibility
          }
          
          // Ensure material responds well to lighting
          material.needsUpdate = true;
        }
        
        console.log(`🔍 Mesh setup: ${child.name || 'unnamed'} - visible: ${child.visible}`);
      }
    });
    
    console.log('✅ Model properties setup complete');
  }

  public update() {
    if (this.boneController) {
      this.boneController.update();
    }
  }

  public clear() {
    if (this.model) {
      this.scene.remove(this.model);
    }
    if (this.boneController) {
      this.scene.remove(this.boneController.controls);
    }
    this.model = null;
    this.boneController = null;
  }

  public getSettings(): GLTFModelSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<GLTFModelSettings>): void {
    console.log('🔧 Updating GLTF settings:', newSettings);
    this.settings = { ...this.settings, ...newSettings };
    
    if (this.model) {
      if (newSettings.showModel !== undefined) {
        console.log(`👁️ Setting model visibility to: ${newSettings.showModel}`);
        this.model.visible = newSettings.showModel;
        console.log(`👁️ Model visibility is now: ${this.model.visible}`);
      }
      
      if (newSettings.modelOpacity !== undefined) {
        console.log(`🎨 Setting model opacity to: ${newSettings.modelOpacity}`);
        this.model.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const material = child.material as THREE.MeshStandardMaterial;
            material.opacity = newSettings.modelOpacity!;
            material.transparent = newSettings.modelOpacity! < 1.0;
          }
        });
      }
      
      if (newSettings.modelScale !== undefined) {
        this.model.scale.setScalar(newSettings.modelScale);
        
        // Also scale the bone controls to match the model scale
        if (this.boneController) {
          this.boneController.setScale(newSettings.modelScale);
        }
      }
    }
  }

  public getModelInfo(): { hasModel: boolean; hasSkeleton: boolean; hasAnimations: boolean } {
    return {
      hasModel: this.model !== null,
      hasSkeleton: this.boneController !== null,
      hasAnimations: false // GLB models can have animations, but we're not using them in this simple implementation
    };
  }

  public updateCharacterPose(_character: any): void {
    // For compatibility with existing code - this would be where bone poses are updated
    // In the new system, bones are manipulated directly through the bone controller
    console.log('🔄 updateCharacterPose called (compatibility method)');
  }

  public hasCharacterModel(_characterId: number): boolean {
    return this.model !== null;
  }

  public addCharacterModel(_character: any): void {
    // Not needed in new approach - model is loaded once
  }

  public updateCharacterModel(_character: any): void {
    // Not needed in new approach - bones are manipulated directly
  }

  public removeCharacterModel(_character: any): void {
    // Not needed in new approach - model persists
  }

  public clearAllModels(): void {
    this.clear();
  }

  public setVisible(visible: boolean): void {
    if (this.model) {
      this.model.visible = visible;
    }
  }

  public isModelLoaded(): boolean {
    return this.model !== null;
  }
}
