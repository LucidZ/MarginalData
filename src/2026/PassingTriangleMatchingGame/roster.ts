import martinezPhoto from "./photos/martinez.jpg";
import molinaPhoto from "./photos/molina.jpg";
import romeroPhoto from "./photos/romero.jpg";
import otamendiPhoto from "./photos/otamendi.jpg";
import tagliaficoPhoto from "./photos/tagliafico.jpg";
import depaulPhoto from "./photos/depaul.jpg";
import macallisterPhoto from "./photos/macallister.jpg";
import fernandezPhoto from "./photos/fernandez.jpg";
import dimariaPhoto from "./photos/dimaria.jpg";
import messiPhoto from "./photos/messi.jpg";
import alvarezPhoto from "./photos/alvarez.jpg";

export interface GamePlayer {
  /** Must exactly match the `pivot` field in wc2022-final-passing.json triangles. */
  fullName: string;
  displayName: string;
  /** Surname only, as commonly used in commentary — for the narrow roster strip. Hardcoded rather than derived from displayName since compound surnames (De Paul, Mac Allister, Di María) break on a naive last-word split. */
  shortName: string;
  number: number;
  /** Headshot sourced from Wikimedia Commons (CC BY-SA) — see photoCredits.ts for attribution. */
  photo: string;
}

// Argentina's starting XI in the 2022 WC Final (4-3-3: Martínez; Molina,
// Romero, Otamendi, Tagliafico; De Paul, Enzo Fernández, Mac Allister; Di
// María, Messi, Álvarez) — all comfortably have 15+ pivot triangles in the
// dataset (StatsBomb open data, match 3869685), plenty for a distinct shape.
export const ROSTER: GamePlayer[] = [
  { fullName: "Damián Emiliano Martínez", displayName: "Emiliano Martínez", shortName: "Martínez", number: 23, photo: martinezPhoto },
  { fullName: "Nahuel Molina Lucero", displayName: "Nahuel Molina", shortName: "Molina", number: 26, photo: molinaPhoto },
  { fullName: "Cristian Gabriel Romero", displayName: "Cristian Romero", shortName: "Romero", number: 13, photo: romeroPhoto },
  { fullName: "Nicolás Hernán Otamendi", displayName: "Nicolás Otamendi", shortName: "Otamendi", number: 19, photo: otamendiPhoto },
  { fullName: "Nicolás Alejandro Tagliafico", displayName: "Nicolás Tagliafico", shortName: "Tagliafico", number: 3, photo: tagliaficoPhoto },
  { fullName: "Rodrigo Javier De Paul", displayName: "Rodrigo De Paul", shortName: "De Paul", number: 7, photo: depaulPhoto },
  { fullName: "Alexis Mac Allister", displayName: "Alexis Mac Allister", shortName: "Mac Allister", number: 20, photo: macallisterPhoto },
  { fullName: "Enzo Fernandez", displayName: "Enzo Fernández", shortName: "Fernández", number: 24, photo: fernandezPhoto },
  { fullName: "Ángel Fabián Di María Hernández", displayName: "Ángel Di María", shortName: "Di María", number: 11, photo: dimariaPhoto },
  { fullName: "Lionel Andrés Messi Cuccittini", displayName: "Lionel Messi", shortName: "Messi", number: 10, photo: messiPhoto },
  { fullName: "Julián Álvarez", displayName: "Julián Álvarez", shortName: "Álvarez", number: 9, photo: alvarezPhoto },
];
