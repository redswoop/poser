import * as THREE from 'three';

export interface Keypoint {
  x: number;
  y: number;
  z: number;
}

export interface Character {
  id: number;
  name: string;
  color: string;
  visible: boolean;
  keypoints: Record<string, Keypoint>;
  modelPath?: string;
  boneRotations?: Record<string, { x: number; y: number; z: number; order: string }>;
}

export interface BoneConnection {
  start: string;
  end: string;
}

export interface BoneConstraint {
  joint1: string;
  joint2: string;
  length: number;
}

export interface Preset {
  [jointName: string]: Keypoint;
}

export interface SceneSettings {
  boneThickness: number;
  jointSize: number;
  gridVisible: boolean;
}

export interface MeshSettings {
  showMesh: boolean;
  showSkeleton: boolean;
  meshOpacity: number;
  skinColor: number;
  clothingColor: number;
  meshQuality: 'low' | 'medium' | 'high';
}

export interface GLTFModelSettings {
  showModel: boolean;
  modelOpacity: number;
  modelScale: number;
  modelPath: string;
}

export interface RaycastResult {
  character: Character;
  jointName: string;
  point: THREE.Vector3;
  distance: number;
}

export interface ExportData {
  characters: Character[];
  settings?: SceneSettings;
}

export interface UndoAction {
  id: string;
  type: 'joint-move' | 'character-add' | 'character-delete' | 'preset-apply' | 'character-import' | 'clear-all' | 'ik-solve';
  description: string;
  timestamp: number;
  beforeState: AppState;
  afterState: AppState;
}

export interface AppState {
  characters: Character[];
  selectedCharacterId: number | null;
  selectedJoint: string | null;
  nextCharacterId: number;
  currentModelPath?: string;
  currentModelSettings?: GLTFModelSettings;
}

export interface UndoRedoManager {
  history: UndoAction[];
  currentIndex: number;
  maxHistorySize: number;
}

export interface CameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  zoom: number;
}
