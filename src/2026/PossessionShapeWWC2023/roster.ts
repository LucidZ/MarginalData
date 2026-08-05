import type { GamePlayer } from "../PassingTriangleMatchingGame/roster";

export type { GamePlayer };

import collPhoto from "./photos/coll.jpg";
import batllePhoto from "./photos/batlle.jpg";
import paredesPhoto from "./photos/paredes.jpg";
import codinaPhoto from "./photos/codina.jpg";
import carmonaPhoto from "./photos/carmona.jpg";
import abelleiraPhoto from "./photos/abelleira.jpg";
import bonmatiPhoto from "./photos/bonmati.jpg";
import redondoPhoto from "./photos/redondo.jpg";
import hermosoPhoto from "./photos/hermoso.jpg";
import caldenteyPhoto from "./photos/caldentey.jpg";
import paralluleoPhoto from "./photos/paralluelo.jpg";

import earpsPhoto from "./photos/earps.jpg";
import carterPhoto from "./photos/carter.jpg";
import brightPhoto from "./photos/bright.jpg";
import greenwoodPhoto from "./photos/greenwood.jpg";
import bronzePhoto from "./photos/bronze.jpg";
import dalyPhoto from "./photos/daly.jpg";
import stanwayPhoto from "./photos/stanway.jpg";
import walshPhoto from "./photos/walsh.jpg";
import toonePhoto from "./photos/toone.jpg";
import russoPhoto from "./photos/russo.jpg";
import hempPhoto from "./photos/hemp.jpg";

// Spain's starting XI in the 2023 Women's World Cup Final (4-2-3-1: Coll;
// Batlle, Paredes, Codina, Carmona; Abelleira, Bonmatí; Redondo, Hermoso,
// Caldentey; Paralluelo). `fullName` must exactly match the `fullName` field
// in wwc2023-final-possession-shape.json (StatsBomb's own player-name
// strings, including the "Olga  Carmona García" double space, which comes
// from StatsBomb's source data as-is).
export const SPAIN_ROSTER: GamePlayer[] = [
  { fullName: "Catalina Thomas Coll Lluch", displayName: "Cata Coll", shortName: "Coll", number: 23, photo: collPhoto },
  { fullName: "Ona Batlle Pascual", displayName: "Ona Batlle", shortName: "Batlle", number: 2, photo: batllePhoto },
  { fullName: "Irene Paredes Hernandez", displayName: "Irene Paredes", shortName: "Paredes", number: 4, photo: paredesPhoto },
  { fullName: "Laia Codina Panedas", displayName: "Laia Codina", shortName: "Codina", number: 14, photo: codinaPhoto },
  { fullName: "Olga  Carmona García", displayName: "Olga Carmona", shortName: "Carmona", number: 19, photo: carmonaPhoto },
  { fullName: "Teresa Abelleira Dueñas", displayName: "Teresa Abelleira", shortName: "Abelleira", number: 3, photo: abelleiraPhoto },
  { fullName: "Aitana Bonmati Conca", displayName: "Aitana Bonmatí", shortName: "Bonmatí", number: 6, photo: bonmatiPhoto },
  { fullName: "Alba María Redondo Ferrer", displayName: "Alba Redondo", shortName: "Redondo", number: 17, photo: redondoPhoto },
  { fullName: "Jennifer Hermoso Fuentes", displayName: "Jenni Hermoso", shortName: "Hermoso", number: 10, photo: hermosoPhoto },
  { fullName: "María Francesca Caldentey Oliver", displayName: "Mariona Caldentey", shortName: "Caldentey", number: 8, photo: caldenteyPhoto },
  { fullName: "Salma Paralluelo Ayingono", displayName: "Salma Paralluelo", shortName: "Paralluelo", number: 18, photo: paralluleoPhoto },
];

// England's starting XI in the 2023 Women's World Cup Final (3-5-2: Earps;
// Carter, Bright, Greenwood; Bronze, Stanway, Walsh, Daly; Toone; Russo,
// Hemp — StatsBomb records this as a back three with wing-backs).
export const ENGLAND_ROSTER: GamePlayer[] = [
  { fullName: "Mary Alexandra Earps", displayName: "Mary Earps", shortName: "Earps", number: 1, photo: earpsPhoto },
  { fullName: "Jessica Carter", displayName: "Jess Carter", shortName: "Carter", number: 16, photo: carterPhoto },
  { fullName: "Millie Bright", displayName: "Millie Bright", shortName: "Bright", number: 6, photo: brightPhoto },
  { fullName: "Alex Greenwood", displayName: "Alex Greenwood", shortName: "Greenwood", number: 5, photo: greenwoodPhoto },
  { fullName: "Lucy Bronze", displayName: "Lucy Bronze", shortName: "Bronze", number: 2, photo: bronzePhoto },
  { fullName: "Rachel Daly", displayName: "Rachel Daly", shortName: "Daly", number: 9, photo: dalyPhoto },
  { fullName: "Georgia Stanway", displayName: "Georgia Stanway", shortName: "Stanway", number: 8, photo: stanwayPhoto },
  { fullName: "Keira Walsh", displayName: "Keira Walsh", shortName: "Walsh", number: 4, photo: walshPhoto },
  { fullName: "Ella Toone", displayName: "Ella Toone", shortName: "Toone", number: 10, photo: toonePhoto },
  { fullName: "Alessia Russo", displayName: "Alessia Russo", shortName: "Russo", number: 23, photo: russoPhoto },
  { fullName: "Lauren Hemp", displayName: "Lauren Hemp", shortName: "Hemp", number: 11, photo: hempPhoto },
];

export const ROSTER_BY_TEAM: Record<string, GamePlayer[]> = {
  "Spain Women's": SPAIN_ROSTER,
  "England Women's": ENGLAND_ROSTER,
};
