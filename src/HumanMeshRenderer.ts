import * as THREE from 'three';
import type { Character } from './types';

export interface MeshSettings {
  showMesh: boolean;
  showSkeleton: boolean;
  meshOpacity: number;
  skinColor: number;
  clothingColor: number;
  meshQuality: 'low' | 'medium' | 'high';
}

export class HumanMeshRenderer {
  private scene: THREE.Scene;
  private meshGroups: Map<number, THREE.Group> = new Map();
  private settings: MeshSettings = {
    showMesh: true,
    showSkeleton: true,
    meshOpacity: 0.9,
    skinColor: 0xfdbcb4,
    clothingColor: 0x4a90e2,
    meshQuality: 'medium'
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public updateSettings(newSettings: Partial<MeshSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    // If mesh visibility changed, update all mesh groups
    if (newSettings.showMesh !== undefined) {
      this.meshGroups.forEach(group => {
        group.visible = newSettings.showMesh!;
      });
    }
    
    // Update all existing meshes
    this.meshGroups.forEach((group) => {
      this.updateMeshAppearance(group);
    });
  }

  public getSettings(): MeshSettings {
    return { ...this.settings };
  }

  public addCharacterMesh(character: Character): void {
    if (!this.settings.showMesh) return;

    // Only create the group if it doesn't exist
    if (!this.meshGroups.has(character.id)) {
      const group = new THREE.Group();
      group.name = `mesh-${character.id}`;
      
      this.meshGroups.set(character.id, group);
      this.scene.add(group);
    }
    
    // Always update the mesh content
    this.updateCharacterMesh(character);
  }

  public updateCharacterMesh(character: Character): void {
    if (!this.settings.showMesh) {
      this.removeCharacterMesh(character);
      return;
    }

    let group = this.meshGroups.get(character.id);
    if (!group) {
      // Create group if it doesn't exist
      group = new THREE.Group();
      group.name = `mesh-${character.id}`;
      this.meshGroups.set(character.id, group);
      this.scene.add(group);
    }

    // Clear existing mesh completely
    const childrenToRemove = [...group.children];
    childrenToRemove.forEach(child => {
      group!.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
    
    if (!character.visible) return;

    // Create mesh based on GLB bone structure - fully generic approach
    this.createGenericBoneStructure(character, group);
  }

  private createLimbSegment(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    radius: number,
    segments: number
  ): THREE.Mesh {
    const startVec = new THREE.Vector3(start.x, start.y, start.z);
    const endVec = new THREE.Vector3(end.x, end.y, end.z);
    const direction = new THREE.Vector3().subVectors(endVec, startVec);
    const length = direction.length();
    
    const geometry = new THREE.CylinderGeometry(
      radius * 0.8,  // top radius (slightly smaller)
      radius,        // bottom radius
      length,
      segments
    );
    
    const material = new THREE.MeshLambertMaterial({
      color: this.settings.skinColor,
      transparent: true,
      opacity: this.settings.meshOpacity
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    
    // Position and orient the limb segment
    mesh.position.copy(startVec).add(direction.multiplyScalar(0.5));
    mesh.lookAt(endVec);
    mesh.rotateX(Math.PI / 2);
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  private createJointMesh(
    position: { x: number; y: number; z: number },
    radius: number,
    segments: number
  ): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, segments, segments);
    const material = new THREE.MeshLambertMaterial({
      color: this.settings.skinColor,
      transparent: true,
      opacity: this.settings.meshOpacity
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  private getSegments(): number {
    switch (this.settings.meshQuality) {
      case 'low': return 6;
      case 'medium': return 12;
      case 'high': return 24;
      default: return 12;
    }
  }

  private updateMeshAppearance(group: THREE.Group): void {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshLambertMaterial;
        material.opacity = this.settings.meshOpacity;
        material.transparent = this.settings.meshOpacity < 1;
        
        // Update colors based on mesh type
        if (child.userData?.meshType === 'torso') {
          material.color.setHex(this.settings.clothingColor);
        } else {
          material.color.setHex(this.settings.skinColor);
        }
        
        material.needsUpdate = true;
      }
    });
  }

  public removeCharacterMesh(character: Character): void {
    const group = this.meshGroups.get(character.id);
    if (group) {
      // Properly dispose of all meshes and materials
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      
      this.scene.remove(group);
      this.meshGroups.delete(character.id);
    }
  }

  public clearAllMeshes(): void {
    this.meshGroups.forEach(group => {
      // Properly dispose of all meshes and materials
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      
      this.scene.remove(group);
    });
    this.meshGroups.clear();
  }

  public setVisible(visible: boolean): void {
    this.settings.showMesh = visible;
    this.meshGroups.forEach(group => {
      group.visible = visible;
    });
  }

  public hasCharacterMesh(characterId: number): boolean {
    return this.meshGroups.has(characterId);
  }

  private createGenericBoneStructure(character: Character, group: THREE.Group): void {
    // Get all available joints from the character
    const jointNames = Object.keys(character.keypoints);
    
    if (jointNames.length === 0) {
      console.warn('⚠️ HumanMeshRenderer: No joints found in character');
      return;
    }
    
    console.log(`🔧 HumanMeshRenderer: Creating generic bone structure for ${jointNames.length} joints:`, jointNames);
    
    // Create joint spheres for all joints
    const segments = this.getSegments();
    const jointRadius = 0.08;
    
    jointNames.forEach(jointName => {
      const joint = character.keypoints[jointName];
      if (joint) {
        const jointMesh = this.createJointMesh(joint, jointRadius, segments);
        jointMesh.userData = { jointName, meshType: 'joint' };
        group.add(jointMesh);
      }
    });
    
    // Create bone connections based on common naming patterns
    // This is a heuristic approach until we get proper bone hierarchy
    this.createBoneConnections(character, group, jointNames);
  }
  
  private createBoneConnections(character: Character, group: THREE.Group, jointNames: string[]): void {
    const connections: Array<{ start: string; end: string }> = [];
    
    // Define common bone connection patterns based on typical skeleton naming
    const connectionPatterns = [
      // Spine connections
      { pattern: /hips?|pelvis/i, connects: /spine|spine1|spine01/i },
      { pattern: /spine(?!.*arm|.*leg)/i, connects: /spine1|spine01|chest|neck/i },
      { pattern: /spine1|spine01/i, connects: /spine2|spine02|chest|neck/i },
      { pattern: /spine2|spine02|chest/i, connects: /neck/i },
      { pattern: /neck/i, connects: /head/i },
      
      // Arm connections
      { pattern: /shoulder.*left|left.*shoulder/i, connects: /arm.*left|left.*arm|upperarm.*left|left.*upperarm/i },
      { pattern: /shoulder.*right|right.*shoulder/i, connects: /arm.*right|right.*arm|upperarm.*right|right.*upperarm/i },
      { pattern: /(?:upper)?arm.*left|left.*(?:upper)?arm/i, connects: /forearm.*left|left.*forearm|elbow.*left|left.*elbow/i },
      { pattern: /(?:upper)?arm.*right|right.*(?:upper)?arm/i, connects: /forearm.*right|right.*forearm|elbow.*right|right.*elbow/i },
      { pattern: /forearm.*left|left.*forearm/i, connects: /hand.*left|left.*hand|wrist.*left|left.*wrist/i },
      { pattern: /forearm.*right|right.*forearm/i, connects: /hand.*right|right.*hand|wrist.*right|right.*wrist/i },
      
      // Leg connections
      { pattern: /hips?|pelvis/i, connects: /(?:upper)?leg.*left|left.*(?:upper)?leg|thigh.*left|left.*thigh/i },
      { pattern: /hips?|pelvis/i, connects: /(?:upper)?leg.*right|right.*(?:upper)?leg|thigh.*right|right.*thigh/i },
      { pattern: /(?:upper)?leg.*left|left.*(?:upper)?leg|thigh.*left|left.*thigh/i, connects: /leg.*left|left.*leg|knee.*left|left.*knee/i },
      { pattern: /(?:upper)?leg.*right|right.*(?:upper)?leg|thigh.*right|right.*thigh/i, connects: /leg.*right|right.*leg|knee.*right|right.*knee/i },
      { pattern: /leg.*left|left.*leg/i, connects: /foot.*left|left.*foot|ankle.*left|left.*ankle/i },
      { pattern: /leg.*right|right.*leg/i, connects: /foot.*right|right.*foot|ankle.*right|right.*ankle/i },
    ];
    
    // Find connections based on patterns
    connectionPatterns.forEach(({ pattern, connects }) => {
      const startJoints = jointNames.filter(name => pattern.test(name));
      const endJoints = jointNames.filter(name => connects.test(name));
      
      startJoints.forEach(start => {
        endJoints.forEach(end => {
          // Avoid connecting a joint to itself
          if (start !== end) {
            connections.push({ start, end });
          }
        });
      });
    });
    
    // Remove duplicate connections
    const uniqueConnections = connections.filter((conn, index, arr) => 
      arr.findIndex(c => 
        (c.start === conn.start && c.end === conn.end) || 
        (c.start === conn.end && c.end === conn.start)
      ) === index
    );
    
    console.log(`🔗 HumanMeshRenderer: Creating ${uniqueConnections.length} bone connections:`, uniqueConnections);
    
    // Create bone segments for each connection
    uniqueConnections.forEach(({ start, end }) => {
      const startJoint = character.keypoints[start];
      const endJoint = character.keypoints[end];
      
      if (startJoint && endJoint) {
        const boneSegment = this.createLimbSegment(startJoint, endJoint, 0.05, this.getSegments());
        boneSegment.userData = { meshType: 'bone', startJoint: start, endJoint: end };
        group.add(boneSegment);
      }
    });
  }
}
