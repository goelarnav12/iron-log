// Field names are camelCase here and snake_case in Postgres. The mapping
// happens in db.ts and nowhere else — see the row<->model helpers there.

export type TrackingType =
  | 'weight_reps'
  | 'reps_only'
  | 'duration'
  | 'weighted_bodyweight';

export type SetType = 'warmup' | 'normal' | 'failure' | 'drop';

export interface Exercise {
  id: string;
  /** null for the built-in library, your uid for a custom exercise. */
  userId: string | null;
  name: string;
  muscleGroup: string;
  equipment: string;
  trackingType: TrackingType;
  notes: string | null;
}

export interface WorkoutSet {
  id: string;
  workoutExerciseId: string;
  position: number;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  setType: SetType;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: number;
  notes: string | null;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  userId: string;
  name: string;
  routineId: string | null;
  startedAt: string;
  /** null means this workout is the one currently in progress. */
  endedAt: string | null;
  notes: string | null;
  exercises: WorkoutExercise[];
}

export interface RoutineExercise {
  id: string;
  routineId: string;
  exerciseId: string;
  position: number;
  targetSets: number;
  notes: string | null;
}

export interface Routine {
  id: string;
  userId: string;
  name: string;
  notes: string | null;
  position: number;
  exercises: RoutineExercise[];
}

export interface CardioSession {
  id: string;
  userId: string;
  date: string;
  activity: string;
  durationS: number;
  distanceM: number | null;
  avgHr: number | null;
  calories: number | null;
  notes: string | null;
}

/** Every field but `date` is optional, so a bare weigh-in is a valid row. */
export interface BodyMeasurement {
  id: string;
  userId: string;
  date: string;
  weightKg: number | null;
  neckCm: number | null;
  shouldersCm: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  leftArmCm: number | null;
  rightArmCm: number | null;
  leftThighCm: number | null;
  rightThighCm: number | null;
  leftCalfCm: number | null;
  rightCalfCm: number | null;
  notes: string | null;
}

/** A movement you accumulate through the day rather than train in a session. */
export interface Counter {
  id: string;
  userId: string;
  exerciseId: string;
  /** Reps/day you're aiming for. Null means any non-zero day counts. */
  dailyGoal: number | null;
  position: number;
}

/** One set, not a daily total — the daily total is a sum of these. */
export interface CounterEntry {
  id: string;
  userId: string;
  counterId: string;
  /** Local calendar date, YYYY-MM-DD. See migration_002 for why not a timestamp. */
  date: string;
  reps: number;
}

// Order matters: this drives the filter chips on the library and picker
// screens, so it runs roughly top-of-body to bottom rather than alphabetically.
export const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Lats', 'Lower Back', 'Traps', 'Shoulders', 'Biceps',
  'Triceps', 'Forearms', 'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Adductors',
  'Abductors', 'Calves', 'Neck', 'Full Body',
] as const;

export const EQUIPMENT = [
  'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell',
  'Band', 'Smith', 'Plate', 'Suspension', 'Other',
] as const;

export const CARDIO_ACTIVITIES = [
  'Run', 'Walk', 'Cycle', 'Swim', 'Row', 'Elliptical', 'Stair Climber',
  'Hike', 'Jump Rope', 'Other',
] as const;

/** The measurement columns, in the order the form and the picker show them. */
export const MEASUREMENT_FIELDS = [
  ['neckCm', 'Neck'],
  ['shouldersCm', 'Shoulders'],
  ['chestCm', 'Chest'],
  ['waistCm', 'Waist'],
  ['hipsCm', 'Hips'],
  ['leftArmCm', 'Left Arm'],
  ['rightArmCm', 'Right Arm'],
  ['leftThighCm', 'Left Thigh'],
  ['rightThighCm', 'Right Thigh'],
  ['leftCalfCm', 'Left Calf'],
  ['rightCalfCm', 'Right Calf'],
] as const;

export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number][0];
