import {
  ROSTER as ARGENTINA_MATCHING_GAME_ROSTER,
  type GamePlayer,
} from "../PassingTriangleMatchingGame/roster";

import lorisPhoto from "./photos/lloris.jpg";
import kundePhoto from "./photos/kounde.jpg";
import varanePhoto from "./photos/varane.jpg";
import upamecanoPhoto from "./photos/upamecano.jpg";
import hernandezPhoto from "./photos/hernandez.jpg";
import tchouameniPhoto from "./photos/tchouameni.jpg";
import rabiotPhoto from "./photos/rabiot.jpg";
import dembelePhoto from "./photos/dembele.jpg";
import griezmannPhoto from "./photos/griezmann.jpg";
import mbappePhoto from "./photos/mbappe.jpg";
import giroudPhoto from "./photos/giroud.jpg";

export type { GamePlayer };

// Argentina's starting-XI photos/short names are already sourced for the
// matching game — reused as-is rather than re-downloading the same photos.
export const ARGENTINA_ROSTER: GamePlayer[] = ARGENTINA_MATCHING_GAME_ROSTER;

// France's starting XI in the 2022 WC Final (4-2-3-1: Lloris; Koundé,
// Varane, Upamecano, T. Hernández; Tchouaméni, Rabiot; Dembélé, Griezmann,
// Mbappé; Giroud). `fullName` must exactly match the `fullName` field in
// wc2022-final-possession-shape.json (StatsBomb's own player-name strings).
export const FRANCE_ROSTER: GamePlayer[] = [
  { fullName: "Hugo Lloris", displayName: "Hugo Lloris", shortName: "Lloris", number: 1, photo: lorisPhoto },
  { fullName: "Jules Koundé", displayName: "Jules Koundé", shortName: "Koundé", number: 5, photo: kundePhoto },
  { fullName: "Raphaël Varane", displayName: "Raphaël Varane", shortName: "Varane", number: 4, photo: varanePhoto },
  { fullName: "Dayotchanculle Upamecano", displayName: "Dayot Upamecano", shortName: "Upamecano", number: 18, photo: upamecanoPhoto },
  { fullName: "Theo Bernard François Hernández", displayName: "Theo Hernández", shortName: "Hernández", number: 22, photo: hernandezPhoto },
  { fullName: "Aurélien Djani Tchouaméni", displayName: "Aurélien Tchouaméni", shortName: "Tchouaméni", number: 8, photo: tchouameniPhoto },
  { fullName: "Adrien Rabiot", displayName: "Adrien Rabiot", shortName: "Rabiot", number: 14, photo: rabiotPhoto },
  { fullName: "Ousmane Dembélé", displayName: "Ousmane Dembélé", shortName: "Dembélé", number: 11, photo: dembelePhoto },
  { fullName: "Antoine Griezmann", displayName: "Antoine Griezmann", shortName: "Griezmann", number: 7, photo: griezmannPhoto },
  { fullName: "Kylian Mbappé Lottin", displayName: "Kylian Mbappé", shortName: "Mbappé", number: 10, photo: mbappePhoto },
  { fullName: "Olivier Giroud", displayName: "Olivier Giroud", shortName: "Giroud", number: 9, photo: giroudPhoto },
];

export const ROSTER_BY_TEAM: Record<string, GamePlayer[]> = {
  Argentina: ARGENTINA_ROSTER,
  France: FRANCE_ROSTER,
};
