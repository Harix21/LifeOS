alter table public.habits
  add column if not exists icon text not null default 'Flame'
    check (icon in ('Flame', 'BookOpen', 'Dumbbell', 'Droplets', 'Heart', 'Leaf', 'Moon', 'Sun', 'Target', 'Zap')),
  add column if not exists color text not null default 'violet'
    check (color in ('violet', 'blue', 'teal', 'amber', 'rose', 'green'));
