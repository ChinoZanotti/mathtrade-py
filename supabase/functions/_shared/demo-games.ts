// Juegos de prueba para desarrollar sin token de BGG.
// Los usa `bgg-search` cuando no hay BGG_TOKEN y el script `scripts/seed.ts`.
// Los ids son los reales de BoardGameGeek, así los datos siguen siendo válidos cuando llegue el token.
// Sin dependencias: corre igual en Deno y Node.

export interface DemoGame {
  id: number;
  name: string;
  year: number | null;
  thumbnail: string | null;
}

const LIST: [number, string, number][] = [
  [13, 'Catan', 1995],
  [822, 'Carcassonne', 2000],
  [9209, 'Ticket to Ride', 2004],
  [30549, 'Pandemic', 2008],
  [230802, 'Azul', 2017],
  [266192, 'Wingspan', 2019],
  [68448, '7 Wonders', 2010],
  [36218, 'Dominion', 2008],
  [148228, 'Splendor', 2014],
  [178900, 'Codenames', 2015],
  [167791, 'Terraforming Mars', 2016],
  [174430, 'Gloomhaven', 2017],
  [31260, 'Agricola', 2007],
  [3076, 'Puerto Rico', 2002],
  [224517, 'Brass: Birmingham', 2018],
  [199792, 'Everdell', 2018],
  [70323, 'King of Tokyo', 2011],
  [39856, 'Dixit', 2008],
  [163412, 'Patchwork', 2014],
  [12333, 'Twilight Struggle', 2005],
  [169786, 'Scythe', 2016],
  [237182, 'Root', 2018],
  [162886, 'Spirit Island', 2017],
  [124361, 'Concordia', 2013],
  [2651, 'Power Grid', 2004],
  [129622, 'Love Letter', 2012],
  [84876, 'The Castles of Burgundy', 2011],
  [204583, 'Kingdomino', 2016],
  [295947, 'Cascadia', 2021],
  [342942, 'Ark Nova', 2021],
  [133473, 'Sushi Go!', 2013],
  [316554, 'Dune: Imperium', 2020],
  [193738, 'Great Western Trail', 2016],
  [183394, 'Viticulture Essential Edition', 2015],
  [312484, 'Lost Ruins of Arnak', 2020],
  [148949, 'Istanbul', 2014],
  [54043, 'Jaipur', 2009],
  [98778, 'Hanabi', 2010],
  [284083, 'The Crew: The Quest for Planet Nine', 2019],
  [40692, 'Small World', 2009],
  [181304, 'Mysterium', 2015],
  [244521, 'The Quacks of Quedlinburg', 2018],
  [170216, 'Blood Rage', 2015],
  [70919, 'Takenoko', 2011],
  [131357, 'Coup', 2012],
  [128882, 'The Resistance: Avalon', 2012],
];

export const DEMO_GAMES: DemoGame[] = LIST.map(([id, name, year]) => ({ id, name, year, thumbnail: null }));

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Busca en la lista de prueba como lo haría BGG: por parte del nombre, sin importar mayúsculas ni tildes. */
export function searchDemoGames(query: string): DemoGame[] {
  const q = norm(query.trim());
  return DEMO_GAMES.filter((g) => norm(g.name).includes(q)).slice(0, 12);
}
