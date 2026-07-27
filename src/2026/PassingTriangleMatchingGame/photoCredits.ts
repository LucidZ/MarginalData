export interface PhotoCredit {
  fullName: string;
  photographer: string;
  photographerUrl: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

// All headshots are cropped stills sourced from Wikimedia Commons, reused
// under their original CC BY-SA licenses. Photographer/license/source pulled
// directly from each file's Commons extmetadata — see PlayerAvatar.tsx for
// how these render as an in-app credits list.
export const PHOTO_CREDITS: PhotoCredit[] = [
  {
    fullName: "Damián Emiliano Martínez",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Emiliano_Martinez_Argentina_v_Egypt_7_July_2026-093_(cropped).jpg",
  },
  {
    fullName: "Nahuel Molina Lucero",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Nahuel_Molina_Argentina_v_Egypt_7_July_2026-067.jpg",
  },
  {
    fullName: "Cristian Gabriel Romero",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Cristian_Romero_Argentina_v_Egypt_7_July_2026-108.jpg",
  },
  {
    fullName: "Nicolás Hernán Otamendi",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Nicolas_Otamendi_Argentina_v_Spain_19_July_2026-059_(cropped).jpg",
  },
  {
    fullName: "Nicolás Alejandro Tagliafico",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Nicolas_Tagliafico_Argentina_v_Spain_19_July_2026-165.jpg",
  },
  {
    fullName: "Rodrigo Javier De Paul",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Rodrigo_De_Paul_Argentina_v_Spain_19_July_2026-159.jpg",
  },
  {
    fullName: "Alexis Mac Allister",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Alexis_Mac_Allister_Argentina_v_Spain_19_July_2026-162_(cropped).jpg",
  },
  {
    fullName: "Enzo Fernandez",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Enzo_Fernandez_Argentina_v_Spain_19_July_2026-161.jpg",
  },
  {
    fullName: "Ángel Fabián Di María Hernández",
    photographer: "Кирилл Венедиктов (Kirill Venediktov)",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:NIG-ARG_(5).jpg",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:NIG-ARG_(5).jpg",
  },
  {
    fullName: "Lionel Andrés Messi Cuccittini",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Leo_Messi_Argentina_v_Egypt_7_July_2026-1.jpg",
  },
  {
    fullName: "Julián Álvarez",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Julian_Alvarez_Argentina_v_Spain_19_July_2026-052_(cropped).jpg",
  },
];
