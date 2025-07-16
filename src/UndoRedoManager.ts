import type { UndoAction } from './types';

export class UndoRedoManager {
  private history: UndoAction[] = [];
  private currentIndex: number = -1;
  private readonly maxHistorySize: number = 20;
  private actionIdCounter: number = 1;

  public saveState(
    type: UndoAction['type'],
    description: string,
    beforeState: any,
    afterState: any
  ): void {
    // Create the action
    const action: UndoAction = {
      id: `action_${this.actionIdCounter++}`,
      type,
      description,
      timestamp: Date.now(),
      beforeState: this.deepCloneState(beforeState),
      afterState: this.deepCloneState(afterState)
    };

    // Remove any history after current index (we're creating a new branch)
    this.history = this.history.slice(0, this.currentIndex + 1);

    // Add the new action
    this.history.push(action);
    this.currentIndex = this.history.length - 1;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }

    console.log(`Action saved: ${description} (${this.history.length} actions in history)`);
  }

  public canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  public canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  public undo(): any {
    if (!this.canUndo()) return null;

    const action = this.history[this.currentIndex];
    this.currentIndex--;
    
    console.log(`Undoing: ${action.description}`);
    return this.deepCloneState(action.beforeState);
  }

  public redo(): any {
    if (!this.canRedo()) return null;

    this.currentIndex++;
    const action = this.history[this.currentIndex];
    
    console.log(`Redoing: ${action.description}`);
    return this.deepCloneState(action.afterState);
  }

  public getHistory(): UndoAction[] {
    return [...this.history];
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public jumpToAction(actionId: string): any {
    const actionIndex = this.history.findIndex(action => action.id === actionId);
    if (actionIndex === -1) return null;

    const action = this.history[actionIndex];
    this.currentIndex = actionIndex;
    
    console.log(`Jumping to: ${action.description}`);
    return this.deepCloneState(action.afterState);
  }

  public clear(): void {
    this.history = [];
    this.currentIndex = -1;
    console.log('Undo history cleared');
  }

  public getActionDescription(index: number): string {
    if (index < 0 || index >= this.history.length) return '';
    const action = this.history[index];
    const date = new Date(action.timestamp);
    return `${action.description} (${date.toLocaleTimeString()})`;
  }

  private deepCloneState(state: any): any {
    // Handle new simplified bone rotation state structure
    if (state.boneRotations) {
      return {
        boneRotations: this.deepCloneBoneRotations(state.boneRotations),
        timestamp: state.timestamp
      };
    }
    
    // Handle legacy AppState structure (for backward compatibility)
    if (state.characters) {
      return {
        characters: state.characters.map((char: any) => ({
          ...char,
          keypoints: { ...char.keypoints }
        })),
        selectedCharacterId: state.selectedCharacterId,
        selectedJoint: state.selectedJoint,
        nextCharacterId: state.nextCharacterId
      };
    }
    
    // Fallback: return a shallow copy
    return { ...state };
  }

  private deepCloneBoneRotations(boneRotations: Record<string, any>): Record<string, any> {
    const cloned: Record<string, any> = {};
    
    for (const [boneName, rotation] of Object.entries(boneRotations)) {
      if (rotation && typeof rotation === 'object' && rotation.clone) {
        // Handle THREE.Euler objects
        cloned[boneName] = rotation.clone();
      } else if (rotation && typeof rotation === 'object') {
        // Handle plain objects with x, y, z properties
        cloned[boneName] = { ...rotation };
      } else {
        cloned[boneName] = rotation;
      }
    }
    
    return cloned;
  }
}
