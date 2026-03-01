/** Martial arts list for trainer profile / registration. */
export const MARTIAL_ARTS = [
  'Brazilian Jiu-Jitsu (BJJ)',
  'Judo',
  'Karate',
  'Taekwondo',
  'Muay Thai',
  'Boxing',
  'Wrestling',
  'Kickboxing',
  'Krav Maga',
  'Aikido',
  'Wing Chun',
  'Jeet Kune Do',
  'Capoeira',
  'Sambo',
  'Kyokushin Karate',
  'Shotokan Karate',
  'Wado-Ryu Karate',
  'Tang Soo Do',
  'Hapkido',
  'Kung Fu',
  'Mixed Martial Arts (MMA)',
  'Kali/Eskrima/Arnis',
  'Silat',
  'Savate',
  'Lethwei',
];

/** Styles that use a belt/rank system. */
export const BELT_BASED_MARTIAL_ARTS = [
  'Brazilian Jiu-Jitsu (BJJ)',
  'Judo',
  'Karate',
  'Taekwondo',
  'Kyokushin Karate',
  'Shotokan Karate',
  'Wado-Ryu Karate',
  'Tang Soo Do',
  'Hapkido',
];

/** Belt colors per martial art (for dropdown). */
export const BELT_SYSTEMS: Record<string, string[]> = {
  'Brazilian Jiu-Jitsu (BJJ)': ['White', 'Blue', 'Purple', 'Brown', 'Black'],
  Judo: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Brown', 'Black'],
  Karate: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
  Taekwondo: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Red', 'Black'],
  'Kyokushin Karate': ['White', 'Orange', 'Blue', 'Yellow', 'Green', 'Brown', 'Black'],
  'Shotokan Karate': ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
  'Wado-Ryu Karate': ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black'],
  'Tang Soo Do': ['White', 'Orange', 'Green', 'Red', 'Blue', 'Brown', 'Black'],
  Hapkido: ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Red', 'Brown', 'Black'],
};
