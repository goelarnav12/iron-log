-- Built-in exercise library. Run once, after schema.sql, in the SQL Editor.
--
-- These rows have user_id = NULL, which makes them readable by every account
-- and writable by none (no RLS write policy matches a null user_id). Safe to
-- re-run: the anti-join at the bottom skips names already present, so adding
-- to the VALUES list and re-running the whole file only inserts the new ones.
--
-- Naming convention: `Movement (Equipment)` where the same movement exists on
-- several implements, bare name where it doesn't. Keep it — the picker sorts
-- alphabetically, so this groups variants of a lift together.
--
-- tracking_type picks the input row shown in the live workout:
--   weight_reps          weight + reps (the default)
--   weighted_bodyweight  reps, with optional added weight
--   reps_only            reps, no load field
--   duration             a time, no reps
--
-- To remove one, delete it by name — but check first whether any
-- workout_exercises reference it, since that FK is `on delete restrict`.

-- ---------------------------------------------------------------------------
-- Migrations from the first library version, which shipped ~120 exercises.
--
-- These MUST run before the insert below. Several movements gained an
-- equipment qualifier once a second variant existed ("Skullcrusher" ->
-- "Skullcrusher (Barbell)"). Renaming first means the anti-join sees the new
-- name and skips it; renaming after would insert the new name and leave the
-- old row behind as a duplicate. Renaming rather than re-inserting also keeps
-- the history of any workout already referencing that row.
--
-- Each is guarded so a fresh database (where the old name never existed) and a
-- second run are both no-ops.
-- ---------------------------------------------------------------------------
do $$
declare
  renames text[][] := array[
    ['Skullcrusher',                  'Skullcrusher (Barbell)'],
    ['Tricep Kickback',               'Tricep Kickback (Dumbbell)'],
    ['Preacher Curl',                 'Preacher Curl (Barbell)'],
    ['Wrist Curl',                    'Wrist Curl (Barbell)'],
    ['Reverse Wrist Curl',            'Reverse Wrist Curl (Barbell)'],
    ['Reverse Curl',                  'Reverse Curl (Barbell)'],
    ['Upright Row',                   'Upright Row (Barbell)'],
    ['Standing Calf Raise',           'Standing Calf Raise (Machine)'],
    ['Seated Calf Raise',             'Seated Calf Raise (Machine)'],
    ['Calf Raise (Dumbbell)',         'Standing Calf Raise (Dumbbell)'],
    ['Hack Squat',                    'Hack Squat (Machine)'],
    ['Bulgarian Split Squat',         'Bulgarian Split Squat (Dumbbell)'],
    ['Thruster',                      'Thruster (Barbell)'],
    ['Seated Shoulder Press (Machine)', 'Shoulder Press (Machine)']
  ];
  r text[];
begin
  foreach r slice 1 in array renames loop
    update exercises set name = r[2]
     where user_id is null
       and name = r[1]
       and not exists (
         select 1 from exercises e2 where e2.user_id is null and e2.name = r[2]);
  end loop;
end $$;

-- The first version filed these under a muscle group the app no longer lists,
-- which left their filter chip unreachable.
update exercises set muscle_group = 'Lower Back'
  where user_id is null and name in ('Back Extension', 'Good Morning');
update exercises set muscle_group = 'Abductors'
  where user_id is null and name = 'Hip Abduction (Machine)';
update exercises set muscle_group = 'Adductors'
  where user_id is null and name = 'Hip Adduction (Machine)';

-- ---------------------------------------------------------------------------
-- The library itself.
-- ---------------------------------------------------------------------------
with seed(name, muscle_group, equipment, tracking_type) as (
  values
  -- Chest --------------------------------------------------------------
  ('Bench Press (Barbell)',                 'Chest',      'Barbell',    'weight_reps'),
  ('Bench Press (Dumbbell)',                'Chest',      'Dumbbell',   'weight_reps'),
  ('Bench Press (Smith Machine)',           'Chest',      'Smith',      'weight_reps'),
  ('Incline Bench Press (Barbell)',         'Chest',      'Barbell',    'weight_reps'),
  ('Incline Bench Press (Dumbbell)',        'Chest',      'Dumbbell',   'weight_reps'),
  ('Incline Bench Press (Smith Machine)',   'Chest',      'Smith',      'weight_reps'),
  ('Decline Bench Press (Barbell)',         'Chest',      'Barbell',    'weight_reps'),
  ('Decline Bench Press (Dumbbell)',        'Chest',      'Dumbbell',   'weight_reps'),
  ('Chest Press (Machine)',                 'Chest',      'Machine',    'weight_reps'),
  ('Incline Chest Press (Machine)',         'Chest',      'Machine',    'weight_reps'),
  ('Decline Chest Press (Machine)',         'Chest',      'Machine',    'weight_reps'),
  ('Floor Press (Barbell)',                 'Chest',      'Barbell',    'weight_reps'),
  ('Floor Press (Dumbbell)',                'Chest',      'Dumbbell',   'weight_reps'),
  ('Guillotine Press',                      'Chest',      'Barbell',    'weight_reps'),
  ('Landmine Press',                        'Chest',      'Barbell',    'weight_reps'),
  ('Chest Fly (Dumbbell)',                  'Chest',      'Dumbbell',   'weight_reps'),
  ('Incline Chest Fly (Dumbbell)',          'Chest',      'Dumbbell',   'weight_reps'),
  ('Chest Fly (Machine)',                   'Chest',      'Machine',    'weight_reps'),
  ('Pec Deck',                              'Chest',      'Machine',    'weight_reps'),
  ('Cable Crossover',                       'Chest',      'Cable',      'weight_reps'),
  ('Low Cable Crossover',                   'Chest',      'Cable',      'weight_reps'),
  ('High Cable Crossover',                  'Chest',      'Cable',      'weight_reps'),
  ('Cable Fly (Single Arm)',                'Chest',      'Cable',      'weight_reps'),
  ('Svend Press',                           'Chest',      'Plate',      'weight_reps'),
  ('Push Up',                               'Chest',      'Bodyweight', 'weighted_bodyweight'),
  ('Incline Push Up',                       'Chest',      'Bodyweight', 'weighted_bodyweight'),
  ('Decline Push Up',                       'Chest',      'Bodyweight', 'weighted_bodyweight'),
  ('Wide Grip Push Up',                     'Chest',      'Bodyweight', 'weighted_bodyweight'),
  ('Ring Push Up',                          'Chest',      'Suspension', 'weighted_bodyweight'),
  ('Dip (Chest)',                           'Chest',      'Bodyweight', 'weighted_bodyweight'),
  ('Dip (Assisted)',                        'Chest',      'Machine',    'weight_reps'),

  -- Back ---------------------------------------------------------------
  ('Deadlift (Barbell)',                    'Back',       'Barbell',    'weight_reps'),
  ('Deadlift (Dumbbell)',                   'Back',       'Dumbbell',   'weight_reps'),
  ('Deadlift (Trap Bar)',                   'Back',       'Barbell',    'weight_reps'),
  ('Sumo Deadlift (Barbell)',               'Back',       'Barbell',    'weight_reps'),
  ('Deficit Deadlift',                      'Back',       'Barbell',    'weight_reps'),
  ('Rack Pull',                             'Back',       'Barbell',    'weight_reps'),
  ('Bent Over Row (Barbell)',               'Back',       'Barbell',    'weight_reps'),
  ('Bent Over Row (Dumbbell)',              'Back',       'Dumbbell',   'weight_reps'),
  ('Bent Over Row (Underhand)',             'Back',       'Barbell',    'weight_reps'),
  ('Pendlay Row',                           'Back',       'Barbell',    'weight_reps'),
  ('T-Bar Row',                             'Back',       'Barbell',    'weight_reps'),
  ('Seal Row',                              'Back',       'Barbell',    'weight_reps'),
  ('Smith Machine Row',                     'Back',       'Smith',      'weight_reps'),
  ('Landmine Row',                          'Back',       'Barbell',    'weight_reps'),
  ('Meadows Row',                           'Back',       'Barbell',    'weight_reps'),
  ('Kroc Row',                              'Back',       'Dumbbell',   'weight_reps'),
  ('Single Arm Row (Dumbbell)',             'Back',       'Dumbbell',   'weight_reps'),
  ('Single Arm Row (Cable)',                'Back',       'Cable',      'weight_reps'),
  ('Seated Row (Cable)',                    'Back',       'Cable',      'weight_reps'),
  ('Seated Row (Machine)',                  'Back',       'Machine',    'weight_reps'),
  ('Chest Supported Row (Dumbbell)',        'Back',       'Dumbbell',   'weight_reps'),
  ('Chest Supported Row (Machine)',         'Back',       'Machine',    'weight_reps'),
  ('Renegade Row',                          'Back',       'Dumbbell',   'weight_reps'),
  ('Inverted Row',                          'Back',       'Bodyweight', 'weighted_bodyweight'),
  ('Ring Row',                              'Back',       'Suspension', 'weighted_bodyweight'),
  ('Band Row',                              'Back',       'Band',       'reps_only'),

  -- Lats ---------------------------------------------------------------
  ('Lat Pulldown (Cable)',                  'Lats',       'Cable',      'weight_reps'),
  ('Lat Pulldown (Wide Grip)',              'Lats',       'Cable',      'weight_reps'),
  ('Lat Pulldown (Close Grip)',             'Lats',       'Cable',      'weight_reps'),
  ('Lat Pulldown (Underhand)',              'Lats',       'Cable',      'weight_reps'),
  ('Lat Pulldown (Single Arm)',             'Lats',       'Cable',      'weight_reps'),
  ('Lat Pulldown (Machine)',                'Lats',       'Machine',    'weight_reps'),
  ('Straight Arm Pulldown',                 'Lats',       'Cable',      'weight_reps'),
  ('Pull Up',                               'Lats',       'Bodyweight', 'weighted_bodyweight'),
  ('Pull Up (Assisted)',                    'Lats',       'Machine',    'weight_reps'),
  ('Neutral Grip Pull Up',                  'Lats',       'Bodyweight', 'weighted_bodyweight'),
  ('Chin Up',                               'Lats',       'Bodyweight', 'weighted_bodyweight'),
  ('Muscle Up',                             'Lats',       'Bodyweight', 'weighted_bodyweight'),

  -- Lower back ---------------------------------------------------------
  ('Back Extension',                        'Lower Back', 'Bodyweight', 'weighted_bodyweight'),
  ('Reverse Hyperextension',                'Lower Back', 'Machine',    'weight_reps'),
  ('Good Morning',                          'Lower Back', 'Barbell',    'weight_reps'),
  ('Jefferson Curl',                        'Lower Back', 'Barbell',    'weight_reps'),
  ('Superman',                              'Lower Back', 'Bodyweight', 'reps_only'),

  -- Traps --------------------------------------------------------------
  ('Shrug (Barbell)',                       'Traps',      'Barbell',    'weight_reps'),
  ('Shrug (Dumbbell)',                      'Traps',      'Dumbbell',   'weight_reps'),
  ('Shrug (Cable)',                         'Traps',      'Cable',      'weight_reps'),
  ('Shrug (Machine)',                       'Traps',      'Machine',    'weight_reps'),
  ('Shrug (Smith Machine)',                 'Traps',      'Smith',      'weight_reps'),
  ('Behind The Back Shrug',                 'Traps',      'Barbell',    'weight_reps'),
  ('Power Shrug',                           'Traps',      'Barbell',    'weight_reps'),

  -- Shoulders ----------------------------------------------------------
  ('Overhead Press (Barbell)',              'Shoulders',  'Barbell',    'weight_reps'),
  ('Overhead Press (Dumbbell)',             'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Overhead Press (Smith Machine)',        'Shoulders',  'Smith',      'weight_reps'),
  ('Seated Overhead Press (Barbell)',       'Shoulders',  'Barbell',    'weight_reps'),
  ('Seated Overhead Press (Dumbbell)',      'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Shoulder Press (Machine)',              'Shoulders',  'Machine',    'weight_reps'),
  ('Arnold Press',                          'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Push Press',                            'Shoulders',  'Barbell',    'weight_reps'),
  ('Behind The Neck Press',                 'Shoulders',  'Barbell',    'weight_reps'),
  ('Landmine Shoulder Press',               'Shoulders',  'Barbell',    'weight_reps'),
  ('Cuban Press',                           'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Lateral Raise (Dumbbell)',              'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Lateral Raise (Cable)',                 'Shoulders',  'Cable',      'weight_reps'),
  ('Lateral Raise (Machine)',               'Shoulders',  'Machine',    'weight_reps'),
  ('Lateral Raise (Band)',                  'Shoulders',  'Band',       'reps_only'),
  ('Leaning Lateral Raise',                 'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Front Raise (Dumbbell)',                'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Front Raise (Barbell)',                 'Shoulders',  'Barbell',    'weight_reps'),
  ('Front Raise (Cable)',                   'Shoulders',  'Cable',      'weight_reps'),
  ('Front Raise (Plate)',                   'Shoulders',  'Plate',      'weight_reps'),
  ('Rear Delt Fly (Dumbbell)',              'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Rear Delt Fly (Machine)',               'Shoulders',  'Machine',    'weight_reps'),
  ('Rear Delt Fly (Cable)',                 'Shoulders',  'Cable',      'weight_reps'),
  ('Rear Delt Row',                         'Shoulders',  'Barbell',    'weight_reps'),
  ('Face Pull',                             'Shoulders',  'Cable',      'weight_reps'),
  ('Upright Row (Barbell)',                 'Shoulders',  'Barbell',    'weight_reps'),
  ('Upright Row (Dumbbell)',                'Shoulders',  'Dumbbell',   'weight_reps'),
  ('Upright Row (Cable)',                   'Shoulders',  'Cable',      'weight_reps'),
  ('Handstand Push Up',                     'Shoulders',  'Bodyweight', 'weighted_bodyweight'),
  ('Pike Push Up',                          'Shoulders',  'Bodyweight', 'weighted_bodyweight'),

  -- Biceps -------------------------------------------------------------
  ('Bicep Curl (Barbell)',                  'Biceps',     'Barbell',    'weight_reps'),
  ('Bicep Curl (Dumbbell)',                 'Biceps',     'Dumbbell',   'weight_reps'),
  ('Bicep Curl (Cable)',                    'Biceps',     'Cable',      'weight_reps'),
  ('Bicep Curl (Machine)',                  'Biceps',     'Machine',    'weight_reps'),
  ('Bicep Curl (Band)',                     'Biceps',     'Band',       'reps_only'),
  ('EZ Bar Curl',                           'Biceps',     'Barbell',    'weight_reps'),
  ('Hammer Curl (Dumbbell)',                'Biceps',     'Dumbbell',   'weight_reps'),
  ('Hammer Curl (Cable)',                   'Biceps',     'Cable',      'weight_reps'),
  ('Cross Body Hammer Curl',                'Biceps',     'Dumbbell',   'weight_reps'),
  ('Incline Curl (Dumbbell)',               'Biceps',     'Dumbbell',   'weight_reps'),
  ('Preacher Curl (Barbell)',               'Biceps',     'Barbell',    'weight_reps'),
  ('Preacher Curl (Dumbbell)',              'Biceps',     'Dumbbell',   'weight_reps'),
  ('Preacher Curl (Machine)',               'Biceps',     'Machine',    'weight_reps'),
  ('Concentration Curl',                    'Biceps',     'Dumbbell',   'weight_reps'),
  ('Spider Curl',                           'Biceps',     'Dumbbell',   'weight_reps'),
  ('Drag Curl',                             'Biceps',     'Barbell',    'weight_reps'),
  ('Zottman Curl',                          'Biceps',     'Dumbbell',   'weight_reps'),
  ('Bayesian Curl',                         'Biceps',     'Cable',      'weight_reps'),
  ('21s Bicep Curl',                        'Biceps',     'Barbell',    'weight_reps'),

  -- Triceps ------------------------------------------------------------
  ('Close Grip Bench Press',                'Triceps',    'Barbell',    'weight_reps'),
  ('JM Press',                              'Triceps',    'Barbell',    'weight_reps'),
  ('Tate Press',                            'Triceps',    'Dumbbell',   'weight_reps'),
  ('California Press',                      'Triceps',    'Barbell',    'weight_reps'),
  ('Skullcrusher (Barbell)',                'Triceps',    'Barbell',    'weight_reps'),
  ('Skullcrusher (Dumbbell)',               'Triceps',    'Dumbbell',   'weight_reps'),
  ('Skullcrusher (EZ Bar)',                 'Triceps',    'Barbell',    'weight_reps'),
  ('Tricep Pushdown (Cable)',               'Triceps',    'Cable',      'weight_reps'),
  ('Tricep Pushdown (Rope)',                'Triceps',    'Cable',      'weight_reps'),
  ('Tricep Pushdown (V-Bar)',               'Triceps',    'Cable',      'weight_reps'),
  ('Tricep Pushdown (Single Arm)',          'Triceps',    'Cable',      'weight_reps'),
  ('Overhead Tricep Extension (Dumbbell)',  'Triceps',    'Dumbbell',   'weight_reps'),
  ('Overhead Tricep Extension (Cable)',     'Triceps',    'Cable',      'weight_reps'),
  ('Overhead Tricep Extension (Barbell)',   'Triceps',    'Barbell',    'weight_reps'),
  ('Tricep Extension (Machine)',            'Triceps',    'Machine',    'weight_reps'),
  ('Tricep Kickback (Dumbbell)',            'Triceps',    'Dumbbell',   'weight_reps'),
  ('Tricep Kickback (Cable)',               'Triceps',    'Cable',      'weight_reps'),
  ('Dip (Triceps)',                         'Triceps',    'Bodyweight', 'weighted_bodyweight'),
  ('Bench Dip',                             'Triceps',    'Bodyweight', 'weighted_bodyweight'),
  ('Diamond Push Up',                       'Triceps',    'Bodyweight', 'weighted_bodyweight'),

  -- Forearms -----------------------------------------------------------
  ('Wrist Curl (Barbell)',                  'Forearms',   'Barbell',    'weight_reps'),
  ('Wrist Curl (Dumbbell)',                 'Forearms',   'Dumbbell',   'weight_reps'),
  ('Reverse Wrist Curl (Barbell)',          'Forearms',   'Barbell',    'weight_reps'),
  ('Reverse Wrist Curl (Dumbbell)',         'Forearms',   'Dumbbell',   'weight_reps'),
  ('Behind The Back Wrist Curl',            'Forearms',   'Barbell',    'weight_reps'),
  ('Reverse Curl (Barbell)',                'Forearms',   'Barbell',    'weight_reps'),
  ('Reverse Curl (Cable)',                  'Forearms',   'Cable',      'weight_reps'),
  ('Wrist Roller',                          'Forearms',   'Other',      'reps_only'),
  ('Plate Pinch',                           'Forearms',   'Plate',      'duration'),
  ('Farmer''s Walk',                        'Forearms',   'Dumbbell',   'duration'),
  ('Dead Hang',                             'Forearms',   'Bodyweight', 'duration'),

  -- Abs / core ---------------------------------------------------------
  ('Plank',                                 'Abs',        'Bodyweight', 'duration'),
  ('Side Plank',                            'Abs',        'Bodyweight', 'duration'),
  ('Weighted Plank',                        'Abs',        'Plate',      'duration'),
  ('RKC Plank',                             'Abs',        'Bodyweight', 'duration'),
  ('Hollow Body Hold',                      'Abs',        'Bodyweight', 'duration'),
  ('L-Sit',                                 'Abs',        'Bodyweight', 'duration'),
  ('Crunch',                                'Abs',        'Bodyweight', 'reps_only'),
  ('Weighted Crunch',                       'Abs',        'Plate',      'weight_reps'),
  ('Cable Crunch',                          'Abs',        'Cable',      'weight_reps'),
  ('Crunch (Machine)',                      'Abs',        'Machine',    'weight_reps'),
  ('Bicycle Crunch',                        'Abs',        'Bodyweight', 'reps_only'),
  ('Reverse Crunch',                        'Abs',        'Bodyweight', 'reps_only'),
  ('Sit Up',                                'Abs',        'Bodyweight', 'weighted_bodyweight'),
  ('Decline Sit Up',                        'Abs',        'Bodyweight', 'weighted_bodyweight'),
  ('V-Up',                                  'Abs',        'Bodyweight', 'reps_only'),
  ('Toes To Bar',                           'Abs',        'Bodyweight', 'reps_only'),
  ('Hanging Leg Raise',                     'Abs',        'Bodyweight', 'weighted_bodyweight'),
  ('Hanging Knee Raise',                    'Abs',        'Bodyweight', 'weighted_bodyweight'),
  ('Lying Leg Raise',                       'Abs',        'Bodyweight', 'reps_only'),
  ('Captain''s Chair Leg Raise',            'Abs',        'Machine',    'weighted_bodyweight'),
  ('Flutter Kick',                          'Abs',        'Bodyweight', 'duration'),
  ('Scissor Kick',                          'Abs',        'Bodyweight', 'duration'),
  ('Russian Twist',                         'Abs',        'Plate',      'weight_reps'),
  ('Cable Woodchop',                        'Abs',        'Cable',      'weight_reps'),
  ('Pallof Press',                          'Abs',        'Cable',      'weight_reps'),
  ('Side Bend (Dumbbell)',                  'Abs',        'Dumbbell',   'weight_reps'),
  ('Ab Wheel Rollout',                      'Abs',        'Other',      'reps_only'),
  ('Dragon Flag',                           'Abs',        'Bodyweight', 'reps_only'),
  ('Windshield Wiper',                      'Abs',        'Bodyweight', 'reps_only'),
  ('Dead Bug',                              'Abs',        'Bodyweight', 'reps_only'),
  ('Bird Dog',                              'Abs',        'Bodyweight', 'reps_only'),
  ('Mountain Climber',                      'Abs',        'Bodyweight', 'duration'),

  -- Quads --------------------------------------------------------------
  ('Squat (Barbell)',                       'Quads',      'Barbell',    'weight_reps'),
  ('Squat (Dumbbell)',                      'Quads',      'Dumbbell',   'weight_reps'),
  ('Squat (Smith Machine)',                 'Quads',      'Smith',      'weight_reps'),
  ('Front Squat (Barbell)',                 'Quads',      'Barbell',    'weight_reps'),
  ('Front Squat (Dumbbell)',                'Quads',      'Dumbbell',   'weight_reps'),
  ('Box Squat',                             'Quads',      'Barbell',    'weight_reps'),
  ('Pause Squat',                           'Quads',      'Barbell',    'weight_reps'),
  ('Zercher Squat',                         'Quads',      'Barbell',    'weight_reps'),
  ('Overhead Squat',                        'Quads',      'Barbell',    'weight_reps'),
  ('Landmine Squat',                        'Quads',      'Barbell',    'weight_reps'),
  ('Belt Squat',                            'Quads',      'Machine',    'weight_reps'),
  ('Hack Squat (Machine)',                  'Quads',      'Machine',    'weight_reps'),
  ('Hack Squat (Barbell)',                  'Quads',      'Barbell',    'weight_reps'),
  ('Leg Press',                             'Quads',      'Machine',    'weight_reps'),
  ('Leg Press (Single Leg)',                'Quads',      'Machine',    'weight_reps'),
  ('Leg Extension',                         'Quads',      'Machine',    'weight_reps'),
  ('Leg Extension (Single Leg)',            'Quads',      'Machine',    'weight_reps'),
  ('Goblet Squat',                          'Quads',      'Dumbbell',   'weight_reps'),
  ('Split Squat',                           'Quads',      'Dumbbell',   'weight_reps'),
  ('Bulgarian Split Squat (Dumbbell)',      'Quads',      'Dumbbell',   'weight_reps'),
  ('Bulgarian Split Squat (Barbell)',       'Quads',      'Barbell',    'weight_reps'),
  ('Lunge (Dumbbell)',                      'Quads',      'Dumbbell',   'weight_reps'),
  ('Lunge (Barbell)',                       'Quads',      'Barbell',    'weight_reps'),
  ('Walking Lunge',                         'Quads',      'Dumbbell',   'weight_reps'),
  ('Reverse Lunge',                         'Quads',      'Dumbbell',   'weight_reps'),
  ('Curtsy Lunge',                          'Quads',      'Dumbbell',   'weight_reps'),
  ('Step Up',                               'Quads',      'Dumbbell',   'weight_reps'),
  ('Sissy Squat',                           'Quads',      'Bodyweight', 'weighted_bodyweight'),
  ('Pistol Squat',                          'Quads',      'Bodyweight', 'weighted_bodyweight'),
  ('Wall Sit',                              'Quads',      'Bodyweight', 'duration'),

  -- Hamstrings ---------------------------------------------------------
  ('Romanian Deadlift (Barbell)',           'Hamstrings', 'Barbell',    'weight_reps'),
  ('Romanian Deadlift (Dumbbell)',          'Hamstrings', 'Dumbbell',   'weight_reps'),
  ('Romanian Deadlift (Smith Machine)',     'Hamstrings', 'Smith',      'weight_reps'),
  ('Single Leg Romanian Deadlift',          'Hamstrings', 'Dumbbell',   'weight_reps'),
  ('Stiff Leg Deadlift',                    'Hamstrings', 'Barbell',    'weight_reps'),
  ('Lying Leg Curl',                        'Hamstrings', 'Machine',    'weight_reps'),
  ('Seated Leg Curl',                       'Hamstrings', 'Machine',    'weight_reps'),
  ('Standing Leg Curl',                     'Hamstrings', 'Machine',    'weight_reps'),
  ('Nordic Curl',                           'Hamstrings', 'Bodyweight', 'weighted_bodyweight'),
  ('Glute Ham Raise',                       'Hamstrings', 'Machine',    'weighted_bodyweight'),
  ('Slider Leg Curl',                       'Hamstrings', 'Bodyweight', 'reps_only'),

  -- Glutes -------------------------------------------------------------
  ('Hip Thrust (Barbell)',                  'Glutes',     'Barbell',    'weight_reps'),
  ('Hip Thrust (Machine)',                  'Glutes',     'Machine',    'weight_reps'),
  ('Hip Thrust (Smith Machine)',            'Glutes',     'Smith',      'weight_reps'),
  ('Single Leg Hip Thrust',                 'Glutes',     'Bodyweight', 'weighted_bodyweight'),
  ('Glute Bridge',                          'Glutes',     'Bodyweight', 'weighted_bodyweight'),
  ('Glute Bridge (Barbell)',                'Glutes',     'Barbell',    'weight_reps'),
  ('Cable Pull Through',                    'Glutes',     'Cable',      'weight_reps'),
  ('Cable Kickback',                        'Glutes',     'Cable',      'weight_reps'),
  ('Glute Kickback (Machine)',              'Glutes',     'Machine',    'weight_reps'),
  ('Donkey Kick',                           'Glutes',     'Bodyweight', 'reps_only'),
  ('Fire Hydrant',                          'Glutes',     'Bodyweight', 'reps_only'),
  ('Frog Pump',                             'Glutes',     'Bodyweight', 'reps_only'),
  ('Sumo Squat',                            'Glutes',     'Dumbbell',   'weight_reps'),
  ('Banded Lateral Walk',                   'Glutes',     'Band',       'duration'),

  -- Adductors / abductors ----------------------------------------------
  ('Hip Adduction (Machine)',               'Adductors',  'Machine',    'weight_reps'),
  ('Hip Adduction (Cable)',                 'Adductors',  'Cable',      'weight_reps'),
  ('Copenhagen Plank',                      'Adductors',  'Bodyweight', 'duration'),
  ('Cossack Squat',                         'Adductors',  'Bodyweight', 'weighted_bodyweight'),
  ('Hip Abduction (Machine)',               'Abductors',  'Machine',    'weight_reps'),
  ('Hip Abduction (Cable)',                 'Abductors',  'Cable',      'weight_reps'),
  ('Hip Abduction (Band)',                  'Abductors',  'Band',       'reps_only'),

  -- Calves -------------------------------------------------------------
  ('Standing Calf Raise (Machine)',         'Calves',     'Machine',    'weight_reps'),
  ('Standing Calf Raise (Barbell)',         'Calves',     'Barbell',    'weight_reps'),
  ('Standing Calf Raise (Dumbbell)',        'Calves',     'Dumbbell',   'weight_reps'),
  ('Standing Calf Raise (Smith Machine)',   'Calves',     'Smith',      'weight_reps'),
  ('Seated Calf Raise (Machine)',           'Calves',     'Machine',    'weight_reps'),
  ('Seated Calf Raise (Barbell)',           'Calves',     'Barbell',    'weight_reps'),
  ('Calf Press (Leg Press)',                'Calves',     'Machine',    'weight_reps'),
  ('Single Leg Calf Raise',                 'Calves',     'Bodyweight', 'weighted_bodyweight'),
  ('Donkey Calf Raise',                     'Calves',     'Machine',    'weight_reps'),
  ('Tibialis Raise',                        'Calves',     'Bodyweight', 'weighted_bodyweight'),

  -- Neck ---------------------------------------------------------------
  ('Neck Curl',                             'Neck',       'Plate',      'weight_reps'),
  ('Neck Extension',                        'Neck',       'Plate',      'weight_reps'),
  ('Neck Harness Extension',                'Neck',       'Other',      'weight_reps'),
  ('Lateral Neck Flexion',                  'Neck',       'Plate',      'weight_reps'),

  -- Olympic / full body -------------------------------------------------
  ('Clean and Jerk',                        'Full Body',  'Barbell',    'weight_reps'),
  ('Clean and Press',                       'Full Body',  'Barbell',    'weight_reps'),
  ('Power Clean',                           'Full Body',  'Barbell',    'weight_reps'),
  ('Hang Clean',                            'Full Body',  'Barbell',    'weight_reps'),
  ('Clean Pull',                            'Full Body',  'Barbell',    'weight_reps'),
  ('Snatch',                                'Full Body',  'Barbell',    'weight_reps'),
  ('Power Snatch',                          'Full Body',  'Barbell',    'weight_reps'),
  ('Hang Snatch',                           'Full Body',  'Barbell',    'weight_reps'),
  ('Snatch Pull',                           'Full Body',  'Barbell',    'weight_reps'),
  ('Push Jerk',                             'Full Body',  'Barbell',    'weight_reps'),
  ('Split Jerk',                            'Full Body',  'Barbell',    'weight_reps'),
  ('Thruster (Barbell)',                    'Full Body',  'Barbell',    'weight_reps'),
  ('Thruster (Dumbbell)',                   'Full Body',  'Dumbbell',   'weight_reps'),
  ('Kettlebell Swing',                      'Full Body',  'Kettlebell', 'weight_reps'),
  ('Kettlebell Clean',                      'Full Body',  'Kettlebell', 'weight_reps'),
  ('Kettlebell Snatch',                     'Full Body',  'Kettlebell', 'weight_reps'),
  ('Turkish Get Up',                        'Full Body',  'Kettlebell', 'weight_reps'),
  ('Devil Press',                           'Full Body',  'Dumbbell',   'weight_reps'),
  ('Man Maker',                             'Full Body',  'Dumbbell',   'weight_reps'),
  ('Wall Ball',                             'Full Body',  'Other',      'weight_reps'),
  ('Burpee',                                'Full Body',  'Bodyweight', 'reps_only'),
  ('Bear Crawl',                            'Full Body',  'Bodyweight', 'duration'),
  ('Battle Ropes',                          'Full Body',  'Other',      'duration'),
  ('Sled Push',                             'Full Body',  'Machine',    'weight_reps'),
  ('Sled Pull',                             'Full Body',  'Machine',    'weight_reps'),
  ('Tire Flip',                             'Full Body',  'Other',      'reps_only')
)
insert into exercises (user_id, name, muscle_group, equipment, tracking_type)
select null, s.name, s.muscle_group, s.equipment, s.tracking_type
from seed s
where not exists (
  select 1 from exercises e
  where e.user_id is null and lower(e.name) = lower(s.name)
);

-- Sanity check — run this on its own afterwards to confirm the library landed:
--   select muscle_group, count(*) from exercises where user_id is null
--   group by muscle_group order by 2 desc;
