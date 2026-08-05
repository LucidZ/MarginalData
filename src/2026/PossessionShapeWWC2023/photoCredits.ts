export interface PhotoCredit {
  fullName: string;
  photographer: string;
  photographerUrl: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
}

// Headshots for the 2023 Women's World Cup Final starting XIs (Spain 1-0
// England, 20 Aug 2023), sourced from Wikimedia Commons following the same
// method used for the France roster in src/2026/PossessionShape. Where a
// file's own metadata didn't list a Commons user page for the photographer
// (Earps, Daly, Toone — all James Boyes Flickr uploads; Stanway — a Raph_PH
// Flickr upload; Paredes — KIROLARI GAITTUN; Codina — a redlinked account;
// Bright — a redlinked account; Redondo — credited to the European
// Parliament institutionally), the file page itself is used as the
// attribution link instead. `fullName` matches the StatsBomb player-name
// string exactly (including the double space in "Olga  Carmona García",
// which is present in StatsBomb's own source data).
export const WWC2023_FINAL_PHOTO_CREDITS: PhotoCredit[] = [
  // Spain
  {
    fullName: "Catalina Thomas Coll Lluch",
    photographer: "MichaelEmilio",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:MichaelEmilio",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Brann_-_Bar%C3%A7a_Femen%C3%AD_CG3A5987_(cropped2).jpg",
  },
  {
    fullName: "Ona Batlle Pascual",
    photographer: "Estevoaei",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Estevoaei",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Deportivo_Abanca_-_FC_Barcelona_108_(cropped).jpg",
  },
  {
    fullName: "Irene Paredes Hernandez",
    photographer: "KIROLARI GAITTUN",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Irene_Paredes_2022.png",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Irene_Paredes_2022.png",
  },
  {
    fullName: "Laia Codina Panedas",
    photographer: "MarcosMarinM",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Laia_Codina_en_2019.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Laia_Codina_en_2019.jpg",
  },
  {
    fullName: "Olga  Carmona García",
    photographer: "MichaelEmilio",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:MichaelEmilio",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Valerenga_v_Real_Madrid,_2023_-_A_15_(face).jpg",
  },
  {
    fullName: "Teresa Abelleira Dueñas",
    photographer: "MichaelEmilio",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:MichaelEmilio",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Valerenga_v_Real_Madrid,_2023_-_A_07_(cropped).jpg",
  },
  {
    fullName: "Aitana Bonmati Conca",
    photographer: "Barcex",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Barcex",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:25th_Laureus_World_Sports_Awards_-_240422_214032.jpg",
  },
  {
    fullName: "Alba María Redondo Ferrer",
    photographer: "European Parliament",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Alba_Redondo_(face).jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Alba_Redondo_(face).jpg",
  },
  {
    fullName: "Jennifer Hermoso Fuentes",
    photographer: "Estevoaei",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Estevoaei",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Partido_Espa%C3%B1a_-_B%C3%A9lxica_en_Riazor,_clasificatorio_Eurocopa_2025_227_(cropped_-_Jenni_Hermoso)_(cropped).jpg",
  },
  {
    fullName: "María Francesca Caldentey Oliver",
    photographer: "MichaelEmilio",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:MichaelEmilio",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Brann_-_Bar%C3%A7a_Femen%C3%AD_CG3A5801_(cropped).jpg",
  },
  {
    fullName: "Salma Paralluelo Ayingono",
    photographer: "MichaelEmilio",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:MichaelEmilio",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Brann_-_Bar%C3%A7a_Femen%C3%AD_CG3A6178_(cropped).jpg",
  },

  // England
  {
    fullName: "Mary Alexandra Earps",
    photographer: "James Boyes",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Mary_Earps_Man_Utd.jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Mary_Earps_Man_Utd.jpg",
  },
  {
    fullName: "Jessica Carter",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Jess_Carter_Gotham_Portland_26_Sep_2025-133_(cropped).jpg",
  },
  {
    fullName: "Millie Bright",
    photographer: "Ryan Asman",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Millie-Bright.jpg",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Millie-Bright.jpg",
  },
  {
    fullName: "Alex Greenwood",
    photographer: "Katie Chan",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:KTC",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:20250905-Alex_Greenwood_(cropped-J1).jpg",
  },
  {
    fullName: "Lucy Bronze",
    photographer: "Katie Chan",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:KTC",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:20250510-Lucy_Bronze_(cropped_-_portrait).jpg",
  },
  {
    fullName: "Rachel Daly",
    photographer: "James Boyes",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Rachel_Daly_(cropped).jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Rachel_Daly_(cropped).jpg",
  },
  {
    fullName: "Georgia Stanway",
    photographer: "Raph_PH",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:England_Lionesses_Bus_Celebration_-_The_Mall,_London_-_Tuesday_29th_July_2025_28_(cropped_-_Stanway).jpg",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:England_Lionesses_Bus_Celebration_-_The_Mall,_London_-_Tuesday_29th_July_2025_28_(cropped_-_Stanway).jpg",
  },
  {
    fullName: "Keira Walsh",
    photographer: "Katie Chan",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:KTC",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:20250510-Keira_Walsh_(cropped_-_portrait).jpg",
  },
  {
    fullName: "Ella Toone",
    photographer: "James Boyes",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Ella_Toone_2023.jpg",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ella_Toone_2023.jpg",
  },
  {
    fullName: "Alessia Russo",
    photographer: "MichaelEmilio",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:MichaelEmilio",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Valerenga-Arsenal_WUCL_12-12-2024_CG3A4421_05_(cropped-J1).jpg",
  },
  {
    fullName: "Lauren Hemp",
    photographer: "Katie Chan",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:KTC",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:20250905-Lauren_Hemp.jpg",
  },
];
