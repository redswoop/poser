import type { Character, Keypoint } from './types';

export class BoneConstraintSolver {
  private boneLengths: Map<string, number> = new Map();
  private boneConnections: Array<[string, string]> = [
    ['head', 'neck'],
    ['neck', 'leftShoulder'],
    ['neck', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'],
    ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightWrist'],
    ['neck', 'spine'],
    ['spine', 'leftHip'],
    ['spine', 'rightHip'],
    ['leftHip', 'leftKnee'],
    ['leftKnee', 'leftAnkle'],
    ['rightHip', 'rightKnee'],
    ['rightKnee', 'rightAnkle']
  ];

  constructor() {
    this.setupDefaultBoneLengths();
  }

  private setupDefaultBoneLengths(): void {
    // Set up realistic bone lengths in 3D units
    this.boneLengths.set('head-neck', 0.8);
    this.boneLengths.set('neck-leftShoulder', 0.7);
    this.boneLengths.set('neck-rightShoulder', 0.7);
    this.boneLengths.set('leftShoulder-leftElbow', 1.2);
    this.boneLengths.set('leftElbow-leftWrist', 1.1);
    this.boneLengths.set('rightShoulder-rightElbow', 1.2);
    this.boneLengths.set('rightElbow-rightWrist', 1.1);
    this.boneLengths.set('neck-spine', 1.4);
    this.boneLengths.set('spine-leftHip', 0.5);
    this.boneLengths.set('spine-rightHip', 0.5);
    this.boneLengths.set('leftHip-leftKnee', 1.6);
    this.boneLengths.set('leftKnee-leftAnkle', 1.5);
    this.boneLengths.set('rightHip-rightKnee', 1.6);
    this.boneLengths.set('rightKnee-rightAnkle', 1.5);
  }

  public calculateBoneLengthsFromCharacter(character: Character): void {
    // Calculate bone lengths from the current character pose
    this.boneConnections.forEach(([joint1, joint2]) => {
      const pos1 = character.keypoints[joint1];
      const pos2 = character.keypoints[joint2];
      
      if (pos1 && pos2) {
        const distance = this.getDistance3D(pos1, pos2);
        const boneKey = this.getBoneKey(joint1, joint2);
        this.boneLengths.set(boneKey, distance);
      }
    });
  }

  public applyConstraints(character: Character, movedJoint: string, newPosition: Keypoint): void {
    const keypoints = { ...character.keypoints };
    keypoints[movedJoint] = { ...newPosition };

    // Apply constraints iteratively
    for (let iteration = 0; iteration < 5; iteration++) {
      let hasChanges = false;

      this.boneConnections.forEach(([joint1, joint2]) => {
        const boneKey = this.getBoneKey(joint1, joint2);
        const reverseBoneKey = this.getBoneKey(joint2, joint1);
        const targetLength = this.boneLengths.get(boneKey) || this.boneLengths.get(reverseBoneKey);

        if (!targetLength) return;

        const pos1 = keypoints[joint1];
        const pos2 = keypoints[joint2];

        if (!pos1 || !pos2) return;

        const currentDistance = this.getDistance3D(pos1, pos2);
        const difference = Math.abs(currentDistance - targetLength);

        if (difference > 0.01) { // Tolerance threshold
          hasChanges = true;
          
          // Determine which joint to move based on priority
          const joint1Priority = this.getJointPriority(joint1);
          const joint2Priority = this.getJointPriority(joint2);
          
          // Calculate direction vector
          const direction = this.normalize3D({
            x: pos2.x - pos1.x,
            y: pos2.y - pos1.y,
            z: pos2.z - pos1.z
          });

          if (joint1Priority > joint2Priority) {
            // joint1 is more fixed, adjust joint2
            keypoints[joint2] = {
              x: pos1.x + direction.x * targetLength,
              y: pos1.y + direction.y * targetLength,
              z: pos1.z + direction.z * targetLength
            };
          } else if (joint2Priority > joint1Priority) {
            // joint2 is more fixed, adjust joint1
            keypoints[joint1] = {
              x: pos2.x - direction.x * targetLength,
              y: pos2.y - direction.y * targetLength,
              z: pos2.z - direction.z * targetLength
            };
          } else {
            // Equal priority, move both
            const correction = {
              x: direction.x * (currentDistance - targetLength) * 0.5,
              y: direction.y * (currentDistance - targetLength) * 0.5,
              z: direction.z * (currentDistance - targetLength) * 0.5
            };
            
            keypoints[joint1].x += correction.x;
            keypoints[joint1].y += correction.y;
            keypoints[joint1].z += correction.z;
            
            keypoints[joint2].x -= correction.x;
            keypoints[joint2].y -= correction.y;
            keypoints[joint2].z -= correction.z;
          }
        }
      });

      if (!hasChanges) break; // Converged
    }

    // Apply the constrained positions back to the character
    Object.assign(character.keypoints, keypoints);
  }

  private getBoneKey(joint1: string, joint2: string): string {
    return `${joint1}-${joint2}`;
  }

  private getDistance3D(pos1: Keypoint, pos2: Keypoint): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const dz = pos2.z - pos1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private normalize3D(vector: Keypoint): Keypoint {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
    if (length === 0) return { x: 0, y: 0, z: 0 };
    
    return {
      x: vector.x / length,
      y: vector.y / length,
      z: vector.z / length
    };
  }

  private getJointPriority(joint: string): number {
    const priorities: Record<string, number> = {
      'spine': 10,
      'neck': 9,
      'head': 8,
      'leftHip': 7,
      'rightHip': 7,
      'leftShoulder': 6,
      'rightShoulder': 6,
      'leftKnee': 5,
      'rightKnee': 5,
      'leftElbow': 4,
      'rightElbow': 4,
      'leftAnkle': 3,
      'rightAnkle': 3,
      'leftWrist': 2,
      'rightWrist': 2
    };
    
    return priorities[joint] || 1;
  }

  public getBoneLength(joint1: string, joint2: string): number | undefined {
    const boneKey = this.getBoneKey(joint1, joint2);
    const reverseBoneKey = this.getBoneKey(joint2, joint1);
    return this.boneLengths.get(boneKey) || this.boneLengths.get(reverseBoneKey);
  }

  public setBoneLength(joint1: string, joint2: string, length: number): void {
    const boneKey = this.getBoneKey(joint1, joint2);
    this.boneLengths.set(boneKey, length);
  }
}
