export interface GamePlayer {
  /** Must exactly match the `pivot` field in wc2022-final-passing.json triangles. */
  fullName: string;
  displayName: string;
  number: number;
}

// Argentina players from the 2022 WC Final with at least 9 pivot triangles in
// the dataset (StatsBomb open data, match 3869685) — enough sample size per
// player for the pitch to read as a distinct shape.
export const ROSTER: GamePlayer[] = [
  { fullName: "Damián Emiliano Martínez", displayName: "Emiliano Martínez", number: 23 },
  { fullName: "Nahuel Molina Lucero", displayName: "Nahuel Molina", number: 26 },
  { fullName: "Cristian Gabriel Romero", displayName: "Cristian Romero", number: 13 },
  { fullName: "Nicolás Hernán Otamendi", displayName: "Nicolás Otamendi", number: 19 },
  { fullName: "Nicolás Alejandro Tagliafico", displayName: "Nicolás Tagliafico", number: 3 },
  { fullName: "Rodrigo Javier De Paul", displayName: "Rodrigo De Paul", number: 7 },
  { fullName: "Alexis Mac Allister", displayName: "Alexis Mac Allister", number: 20 },
  { fullName: "Enzo Fernandez", displayName: "Enzo Fernández", number: 24 },
  { fullName: "Ángel Fabián Di María Hernández", displayName: "Ángel Di María", number: 11 },
  { fullName: "Lionel Andrés Messi Cuccittini", displayName: "Lionel Messi", number: 10 },
  { fullName: "Julián Álvarez", displayName: "Julián Álvarez", number: 9 },
  { fullName: "Marcos Javier Acuña", displayName: "Marcos Acuña", number: 18 },
  { fullName: "Gonzalo Ariel Montiel", displayName: "Gonzalo Montiel", number: 4 },
  { fullName: "Leandro Daniel Paredes", displayName: "Leandro Paredes", number: 5 },
];
