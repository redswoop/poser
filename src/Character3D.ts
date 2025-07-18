import * as THREE from 'three';
import { GLTFBoneController } from './GLTFBoneController';
import type { GLTFModelSettings } from './types';

export interface CharacterPose {
  name: string;
  rotations: Record<string, THREE.Euler>;
  timestamp: Date;
  description?: string;
}

export interface CharacterMetadata {
  name: string;
  modelPath: string;
  loadedAt: Date;
  boneCount: number;
  hasIK: boolean;
  version: string;
}

export class Character3D {
  // Core model data
  public gltfModel: THREE.Group | null = null;
  public skeleton: THREE.Skeleton | null = null;
  public skinnedMesh: THREE.SkinnedMesh | null = null;
  public modelPath: string = '';
  
  // Bone management
  public boneController: GLTFBoneController | null = null;
  public defaultPose: Record<string, THREE.Euler> = {};
  private savedPoses: Map<string, CharacterPose> = new Map();
  
  // IK state
  public ikChains: Map<string, string[]> = new Map();
  public ikTargets: Map<string, THREE.Vector3> = new Map();
  private ikEnabled: boolean = false;
  
  // Model settings
  public settings: GLTFModelSettings = {
    showModel: true,
    modelOpacity: 1.0,
    modelScale: 1.0,
    modelPath: ''
  };
  
  // Metadata
  public metadata: CharacterMetadata;
  
  constructor(modelPath?: string, name?: string) {
    this.modelPath = modelPath || '';
    this.settings.modelPath = this.modelPath;
    
    this.metadata = {
      name: name || 'Untitled Character',
      modelPath: this.modelPath,
      loadedAt: new Date(),
      boneCount: 0,
      hasIK: false,
      version: '1.0.0'
    };
  }

  // Model lifecycle
  public setModel(gltfModel: THREE.Group, skeleton: THREE.Skeleton, skinnedMesh: THREE.SkinnedMesh): void {
    this.gltfModel = gltfModel;
    this.skeleton = skeleton;
    this.skinnedMesh = skinnedMesh;
    this.metadata.boneCount = skeleton.bones.length;
    this.metadata.loadedAt = new Date();
    
    // Capture default pose
    this.captureDefaultPose();
  }

  public setBoneController(controller: GLTFBoneController): void {
    this.boneController = controller;
  }

  public isLoaded(): boolean {
    return this.gltfModel !== null && this.skeleton !== null && this.skinnedMesh !== null;
  }

  // Pose management
  public captureDefaultPose(): void {
    if (!this.skeleton) return;
    
    this.defaultPose = {};
    this.skeleton.bones.forEach(bone => {
      this.defaultPose[bone.name] = bone.rotation.clone();
    });
    
    console.log(`🎭 Captured default pose for ${this.metadata.name}: ${Object.keys(this.defaultPose).length} bones`);
  }

  public getCurrentPose(): Record<string, THREE.Euler> {
    if (!this.skeleton) return {};
    
    const pose: Record<string, THREE.Euler> = {};
    this.skeleton.bones.forEach(bone => {
      pose[bone.name] = bone.rotation.clone();
    });
    
    return pose;
  }

  public applyPose(pose: Record<string, THREE.Euler>): void {
    if (!this.skeleton) return;
    
    Object.entries(pose).forEach(([boneName, rotation]) => {
      const bone = this.skeleton!.bones.find(b => b.name === boneName);
      if (bone) {
        bone.rotation.copy(rotation);
      }
    });
    
    // Update bone controller if available
    this.boneController?.update();
  }

  public resetToDefault(): void {
    if (Object.keys(this.defaultPose).length === 0) {
      console.warn('⚠️ No default pose available for', this.metadata.name);
      return;
    }
    
    this.applyPose(this.defaultPose);
    console.log(`🔄 Reset ${this.metadata.name} to default pose`);
  }

  public savePose(name: string, description?: string): void {
    const pose: CharacterPose = {
      name,
      rotations: this.getCurrentPose(),
      timestamp: new Date(),
      description
    };
    
    this.savedPoses.set(name, pose);
    console.log(`💾 Saved pose "${name}" for ${this.metadata.name}`);
  }

  public loadPose(name: string): boolean {
    const pose = this.savedPoses.get(name);
    if (!pose) {
      console.warn(`⚠️ Pose "${name}" not found for ${this.metadata.name}`);
      return false;
    }
    
    this.applyPose(pose.rotations);
    console.log(`📂 Loaded pose "${name}" for ${this.metadata.name}`);
    return true;
  }

  public getSavedPoses(): CharacterPose[] {
    return Array.from(this.savedPoses.values());
  }

  public deletePose(name: string): boolean {
    const deleted = this.savedPoses.delete(name);
    if (deleted) {
      console.log(`🗑️ Deleted pose "${name}" from ${this.metadata.name}`);
    }
    return deleted;
  }

  // IK management
  public setupIKChains(): boolean {
    if (!this.boneController) {
      console.warn('⚠️ Cannot setup IK chains: no bone controller');
      return false;
    }
    
    this.boneController.createCommonIKChains();
    
    // Update our IK chains map
    const chainNames = this.boneController.getIKChainNames();
    this.ikChains.clear();
    
    chainNames.forEach(chainName => {
      const bones = this.boneController!.getIKChainBones(chainName);
      this.ikChains.set(chainName, bones);
    });
    
    this.metadata.hasIK = this.ikChains.size > 0;
    this.ikEnabled = this.metadata.hasIK;
    
    console.log(`🦾 Setup ${this.ikChains.size} IK chains for ${this.metadata.name}`);
    return this.metadata.hasIK;
  }

  public solveIK(chainName: string, target: THREE.Vector3): boolean {
    if (!this.boneController || !this.ikEnabled) {
      return false;
    }
    
    const success = this.boneController.solveIK(chainName, target);
    if (success) {
      this.ikTargets.set(chainName, target.clone());
    }
    
    return success;
  }

  public clearIKChains(): void {
    if (this.boneController) {
      this.boneController.clearIKChains();
    }
    
    this.ikChains.clear();
    this.ikTargets.clear();
    this.ikEnabled = false;
    this.metadata.hasIK = false;
    
    console.log(`🧹 Cleared IK chains for ${this.metadata.name}`);
  }

  public getIKChainNames(): string[] {
    return Array.from(this.ikChains.keys());
  }

  public isIKEnabled(): boolean {
    return this.ikEnabled && this.ikChains.size > 0;
  }

  // Settings management
  public updateSettings(newSettings: Partial<GLTFModelSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    // Apply to bone controller if available
    if (this.boneController) {
      if (newSettings.modelScale !== undefined) {
        this.boneController.setScale(newSettings.modelScale);
      }
    }
    
    // Apply to model if available
    if (this.gltfModel) {
      if (newSettings.modelScale !== undefined) {
        this.gltfModel.scale.setScalar(newSettings.modelScale);
      }
      
      if (newSettings.showModel !== undefined) {
        this.gltfModel.visible = newSettings.showModel;
      }
      
      if (newSettings.modelOpacity !== undefined) {
        this.gltfModel.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const material = child.material as THREE.MeshStandardMaterial;
            material.opacity = newSettings.modelOpacity!;
            material.transparent = newSettings.modelOpacity! < 1;
          }
        });
      }
    }
  }

  public getSettings(): GLTFModelSettings {
    return { ...this.settings };
  }

  // Serialization
  public toJSON(): any {
    return {
      metadata: this.metadata,
      modelPath: this.modelPath,
      settings: this.settings,
      defaultPose: this.serializePose(this.defaultPose),
      currentPose: this.serializePose(this.getCurrentPose()),
      savedPoses: Array.from(this.savedPoses.entries()).map(([name, pose]) => ({
        name,
        rotations: this.serializePose(pose.rotations),
        timestamp: pose.timestamp.toISOString()
      })),
      ikChains: Array.from(this.ikChains.entries()),
      ikTargets: Array.from(this.ikTargets.entries()).map(([name, target]) => [
        name,
        { x: target.x, y: target.y, z: target.z }
      ]),
      ikEnabled: this.ikEnabled
    };
  }

  public static fromJSON(data: any): Character3D {
    const character = new Character3D(data.modelPath, data.metadata?.name);
    
    // Restore metadata
    if (data.metadata) {
      character.metadata = {
        ...data.metadata,
        loadedAt: new Date(data.metadata.loadedAt)
      };
    }
    
    // Restore settings
    if (data.settings) {
      character.settings = data.settings;
    }
    
    // Restore poses
    if (data.defaultPose) {
      character.defaultPose = character.deserializePose(data.defaultPose);
    }
    
    if (data.savedPoses) {
      data.savedPoses.forEach((poseData: any) => {
        const pose: CharacterPose = {
          name: poseData.name,
          rotations: character.deserializePose(poseData.rotations),
          timestamp: new Date(poseData.timestamp),
          description: poseData.description
        };
        character.savedPoses.set(poseData.name, pose);
      });
    }
    
    // Restore IK data
    if (data.ikChains) {
      character.ikChains = new Map(data.ikChains);
    }
    
    if (data.ikTargets) {
      character.ikTargets = new Map(
        data.ikTargets.map(([name, target]: [string, any]) => [
          name,
          new THREE.Vector3(target.x, target.y, target.z)
        ])
      );
    }
    
    character.ikEnabled = data.ikEnabled || false;
    character.metadata.hasIK = character.ikChains.size > 0;
    
    return character;
  }

  // Helper methods for pose serialization
  private serializePose(pose: Record<string, THREE.Euler>): Record<string, any> {
    const serialized: Record<string, any> = {};
    Object.entries(pose).forEach(([boneName, euler]) => {
      serialized[boneName] = {
        x: euler.x,
        y: euler.y,
        z: euler.z,
        order: euler.order
      };
    });
    return serialized;
  }

  private deserializePose(serializedPose: Record<string, any>): Record<string, THREE.Euler> {
    const pose: Record<string, THREE.Euler> = {};
    Object.entries(serializedPose).forEach(([boneName, eulerData]) => {
      pose[boneName] = new THREE.Euler(
        eulerData.x,
        eulerData.y,
        eulerData.z,
        eulerData.order as THREE.EulerOrder
      );
    });
    return pose;
  }

  // Utility methods
  public getBoneByName(boneName: string): THREE.Bone | null {
    if (!this.skeleton) return null;
    return this.skeleton.bones.find(bone => bone.name === boneName) || null;
  }

  public getBoneNames(): string[] {
    if (!this.skeleton) return [];
    return this.skeleton.bones.map(bone => bone.name);
  }

  public getBoneCount(): number {
    return this.metadata.boneCount;
  }

  public getModelInfo(): { hasModel: boolean; hasSkeleton: boolean; hasAnimations: boolean } {
    return {
      hasModel: this.gltfModel !== null,
      hasSkeleton: this.skeleton !== null,
      hasAnimations: false // Can be extended later
    };
  }

  // Pose import/export methods
  public exportPose(): any {
    const currentPose = this.getCurrentPose();
    
    return {
      timestamp: new Date().toISOString(),
      modelPath: this.modelPath,
      modelSettings: this.settings,
      boneRotations: this.serializePose(currentPose),
      metadata: {
        appVersion: '1.0.0',
        boneCount: Object.keys(currentPose).length,
        description: 'Exported from 3D Character Poser',
        characterName: this.metadata.name
      }
    };
  }

  public async importPose(jsonData: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate the data structure
      if (!jsonData || typeof jsonData !== 'object') {
        return { success: false, error: 'Invalid pose data format' };
      }

      // Import model settings if provided
      if (jsonData.modelSettings) {
        this.updateSettings(jsonData.modelSettings);
      }

      // Import bone rotations if provided
      if (jsonData.boneRotations) {
        const rotations = this.deserializePose(jsonData.boneRotations);
        this.applyPose(rotations);
      }

      console.log('✅ Pose imported successfully to Character3D');
      return { success: true };
    } catch (error) {
      console.error('❌ Error importing pose to Character3D:', error);
      return { success: false, error: String(error) };
    }
  }

  public exportCharacterState(): any {
    return {
      modelPath: this.modelPath,
      modelSettings: this.settings,
      boneRotations: this.serializePose(this.getCurrentPose()),
      defaultPose: this.serializePose(this.defaultPose),
      timestamp: Date.now(),
      version: '1.0.0',
      metadata: this.metadata
    };
  }

  public async importCharacterState(characterState: any): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate the imported state
      if (!characterState || typeof characterState !== 'object') {
        return { success: false, error: 'Invalid character state format' };
      }

      console.log('📥 Importing character state to Character3D:', characterState);

      // Apply model settings
      if (characterState.modelSettings) {
        this.updateSettings(characterState.modelSettings);
      }

      // Apply bone rotations
      if (characterState.boneRotations) {
        const rotations = this.deserializePose(characterState.boneRotations);
        this.applyPose(rotations);
      }

      // Restore default pose
      if (characterState.defaultPose) {
        this.defaultPose = this.deserializePose(characterState.defaultPose);
      }

      // Update metadata if provided
      if (characterState.metadata) {
        this.metadata = { ...this.metadata, ...characterState.metadata };
      }

      console.log('✅ Character state imported successfully to Character3D');
      return { success: true };
    } catch (error) {
      console.error('❌ Error importing character state to Character3D:', error);
      return { success: false, error: String(error) };
    }
  }

  // Cleanup
  public dispose(): void {
    console.log(`🧹 Disposing character: ${this.metadata.name}`);
    
    // Clear pose data
    this.savedPoses.clear();
    this.ikChains.clear();
    this.ikTargets.clear();
    
    // Clear references
    this.gltfModel = null;
    this.skeleton = null;
    this.skinnedMesh = null;
    this.boneController = null;
  }
}
