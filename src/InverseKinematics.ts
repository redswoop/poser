import * as THREE from 'three';

export interface IKChain {
  bones: THREE.Bone[];
  target: THREE.Vector3;
  endEffector: THREE.Vector3;
  maxIterations: number;
  tolerance: number;
}

export interface IKConstraint {
  bone: THREE.Bone;
  minRotation: THREE.Euler;
  maxRotation: THREE.Euler;
}

export class InverseKinematics {
  private chains: Map<string, IKChain> = new Map();
  private constraints: Map<THREE.Bone, IKConstraint> = new Map();

  /**
   * Create an IK chain from a list of bones
   */
  public createChain(
    name: string,
    bones: THREE.Bone[],
    maxIterations: number = 10,
    tolerance: number = 0.01
  ): void {
    if (bones.length < 2) {
      throw new Error('IK chain must have at least 2 bones');
    }

    // Calculate the end effector position (tip of the last bone)
    const endEffector = new THREE.Vector3();
    const lastBone = bones[bones.length - 1];
    
    // For now, assume the end effector is at the end of the last bone
    // This could be customized based on bone length or child positions
    endEffector.copy(lastBone.position);
    if (lastBone.children.length > 0) {
      const child = lastBone.children[0] as THREE.Bone;
      endEffector.copy(child.position);
    }

    const chain: IKChain = {
      bones,
      target: new THREE.Vector3(),
      endEffector,
      maxIterations,
      tolerance
    };

    this.chains.set(name, chain);
    console.log(`🦴 Created IK chain "${name}" with ${bones.length} bones`);
  }

  /**
   * Set a constraint on a bone's rotation
   */
  public setConstraint(bone: THREE.Bone, minRotation: THREE.Euler, maxRotation: THREE.Euler): void {
    this.constraints.set(bone, { bone, minRotation, maxRotation });
  }

  /**
   * Solve IK for a specific chain to reach a target position
   */
  public solve(chainName: string, targetPosition: THREE.Vector3): boolean {
    const chain = this.chains.get(chainName);
    if (!chain) {
      console.error(`❌ IK chain "${chainName}" not found`);
      return false;
    }

    chain.target.copy(targetPosition);
    
    // Store original rotations for rollback if needed
    // const originalRotations = chain.bones.map(bone => bone.rotation.clone()); // Currently unused

    // Use FABRIK (Forward And Backward Reaching Inverse Kinematics) algorithm
    const success = this.solveFABRIK(chain);

    if (!success) {
      console.warn(`⚠️ IK solution for "${chainName}" did not converge`);
      // Optionally rollback to original rotations
      // chain.bones.forEach((bone, i) => bone.rotation.copy(originalRotations[i]));
    }

    return success;
  }

  /**
   * FABRIK algorithm implementation
   */
  private solveFABRIK(chain: IKChain): boolean {
    const { bones, target, maxIterations, tolerance } = chain;
    
    // Calculate bone lengths
    const boneLengths = this.calculateBoneLengths(bones);
    const totalLength = boneLengths.reduce((sum, length) => sum + length, 0);
    
    // Check if target is reachable
    const rootPosition = new THREE.Vector3();
    bones[0].getWorldPosition(rootPosition);
    const distanceToTarget = rootPosition.distanceTo(target);
    
    if (distanceToTarget > totalLength) {
      // Target is too far, stretch towards it
      this.stretchTowardsTarget(bones, boneLengths, rootPosition, target);
      return false;
    }

    // Store joint positions
    const jointPositions = bones.map(bone => {
      const pos = new THREE.Vector3();
      bone.getWorldPosition(pos);
      return pos;
    });

    // Add end effector position
    const endPos = new THREE.Vector3();
    if (bones[bones.length - 1].children.length > 0) {
      (bones[bones.length - 1].children[0] as THREE.Bone).getWorldPosition(endPos);
    } else {
      bones[bones.length - 1].getWorldPosition(endPos);
      endPos.add(new THREE.Vector3(0, boneLengths[boneLengths.length - 1], 0));
    }
    jointPositions.push(endPos);

    // FABRIK iterations
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Forward pass - move from end effector to root
      jointPositions[jointPositions.length - 1].copy(target);
      
      for (let i = jointPositions.length - 2; i >= 0; i--) {
        const direction = new THREE.Vector3()
          .subVectors(jointPositions[i], jointPositions[i + 1])
          .normalize();
        jointPositions[i].copy(jointPositions[i + 1]).add(direction.multiplyScalar(boneLengths[i]));
      }

      // Backward pass - move from root to end effector
      jointPositions[0].copy(rootPosition);
      
      for (let i = 1; i < jointPositions.length; i++) {
        const direction = new THREE.Vector3()
          .subVectors(jointPositions[i], jointPositions[i - 1])
          .normalize();
        jointPositions[i].copy(jointPositions[i - 1]).add(direction.multiplyScalar(boneLengths[i - 1]));
      }

      // Check convergence
      const distanceToTarget = jointPositions[jointPositions.length - 1].distanceTo(target);
      if (distanceToTarget < tolerance) {
        // Apply the solution to the bones
        this.applyPositionsToRotations(bones, jointPositions);
        console.log(`✅ IK solved in ${iteration + 1} iterations`);
        return true;
      }
    }

    // Apply the best solution even if not converged
    this.applyPositionsToRotations(bones, jointPositions);
    return false;
  }

  /**
   * Calculate the length of each bone in the chain
   */
  private calculateBoneLengths(bones: THREE.Bone[]): number[] {
    const lengths: number[] = [];
    
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      let length = 1.0; // Default length
      
      if (bone.children.length > 0) {
        // Use distance to first child
        const childPos = new THREE.Vector3();
        (bone.children[0] as THREE.Bone).getWorldPosition(childPos);
        const bonePos = new THREE.Vector3();
        bone.getWorldPosition(bonePos);
        length = bonePos.distanceTo(childPos);
      } else if (i < bones.length - 1) {
        // Use distance to next bone in chain
        const nextBonePos = new THREE.Vector3();
        bones[i + 1].getWorldPosition(nextBonePos);
        const bonePos = new THREE.Vector3();
        bone.getWorldPosition(bonePos);
        length = bonePos.distanceTo(nextBonePos);
      }
      
      lengths.push(Math.max(length, 0.1)); // Minimum length to avoid issues
    }
    
    return lengths;
  }

  /**
   * Stretch the chain towards an unreachable target
   */
  private stretchTowardsTarget(
    bones: THREE.Bone[],
    boneLengths: number[],
    rootPosition: THREE.Vector3,
    target: THREE.Vector3
  ): void {
    const direction = new THREE.Vector3().subVectors(target, rootPosition).normalize();
    let currentPos = rootPosition.clone();
    
    for (let i = 0; i < bones.length; i++) {
      const nextPos = currentPos.clone().add(direction.clone().multiplyScalar(boneLengths[i]));
      
      // Calculate rotation to point towards next position
      const up = new THREE.Vector3(0, 1, 0);
      const forward = new THREE.Vector3().subVectors(nextPos, currentPos).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, forward);
      
      bones[i].quaternion.copy(quaternion);
      currentPos = nextPos;
    }
  }

  /**
   * Convert joint positions back to bone rotations
   */
  private applyPositionsToRotations(bones: THREE.Bone[], positions: THREE.Vector3[]): void {
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      const currentPos = positions[i];
      const nextPos = positions[i + 1];
      
      // Calculate the direction from current joint to next joint
      const direction = new THREE.Vector3().subVectors(nextPos, currentPos).normalize();
      
      // Default bone direction (assuming bones point upward initially)
      const defaultDirection = new THREE.Vector3(0, 1, 0);
      
      // Calculate rotation needed to align default direction with target direction
      const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultDirection, direction);
      
      // Apply constraints if they exist
      const constraint = this.constraints.get(bone);
      if (constraint) {
        const euler = new THREE.Euler().setFromQuaternion(quaternion);
        
        // Clamp rotations to constraints
        euler.x = Math.max(constraint.minRotation.x, Math.min(constraint.maxRotation.x, euler.x));
        euler.y = Math.max(constraint.minRotation.y, Math.min(constraint.maxRotation.y, euler.y));
        euler.z = Math.max(constraint.minRotation.z, Math.min(constraint.maxRotation.z, euler.z));
        
        bone.rotation.copy(euler);
      } else {
        bone.setRotationFromQuaternion(quaternion);
      }
    }
  }

  /**
   * Get an IK chain by name
   */
  public getChain(chainName: string): IKChain | undefined {
    return this.chains.get(chainName);
  }

  /**
   * Get all available IK chain names
   */
  public getChainNames(): string[] {
    return Array.from(this.chains.keys());
  }

  /**
   * Get bone names for a specific chain
   */
  public getChainBoneNames(chainName: string): string[] {
    const chain = this.chains.get(chainName);
    if (!chain) {
      return [];
    }
    return chain.bones.map(bone => bone.name);
  }

  /**
   * Remove an IK chain
   */
  public removeChain(name: string): void {
    this.chains.delete(name);
  }

  /**
   * Clear all IK chains and constraints
   */
  public clear(): void {
    this.chains.clear();
    this.constraints.clear();
  }

  /**
   * Get the current end effector position for a chain
   */
  public getEndEffectorPosition(chainName: string): THREE.Vector3 | null {
    const chain = this.chains.get(chainName);
    if (!chain) return null;

    const lastBone = chain.bones[chain.bones.length - 1];
    const endPos = new THREE.Vector3();
    
    if (lastBone.children.length > 0) {
      (lastBone.children[0] as THREE.Bone).getWorldPosition(endPos);
    } else {
      lastBone.getWorldPosition(endPos);
      // Estimate end position based on bone direction
      endPos.add(new THREE.Vector3(0, 1, 0));
    }
    
    return endPos;
  }
}
