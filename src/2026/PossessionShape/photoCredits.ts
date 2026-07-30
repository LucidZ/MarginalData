import { PHOTO_CREDITS as ARGENTINA_PHOTO_CREDITS } from "../PassingTriangleMatchingGame/photoCredits";
import type { PhotoCredit } from "../PassingTriangleMatchingGame/photoCredits";

export type { PhotoCredit };

// Argentina's credits are already on file from the matching game — reused
// as-is since the photos themselves are reused, not re-downloaded.
export { ARGENTINA_PHOTO_CREDITS };

// France headshots sourced from Wikimedia Commons. Where a file's own
// metadata didn't list a Commons user page for the photographer (Lloris,
// Varane, Giroud — all attributed via a soccer.ru-sourced upload with a
// named photographer but no Commons account), the file page itself is used
// as the attribution link.
export const FRANCE_PHOTO_CREDITS: PhotoCredit[] = [
  {
    fullName: "Hugo Lloris",
    photographer: "Кирилл Венедиктов (Kirill Venediktov)",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Lloris_2018_(cropped).jpg",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Lloris_2018_(cropped).jpg",
  },
  {
    fullName: "Jules Koundé",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Jules_Kounde_France_v_Spain_7.24.26-180.jpg",
  },
  {
    fullName: "Raphaël Varane",
    photographer: "Антон Зайцев (Anton Zaitsev)",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Raphaël_Varane_2018_(cropped).jpg",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Raphaël_Varane_2018_(cropped).jpg",
  },
  {
    fullName: "Dayotchanculle Upamecano",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Dayot_Upamecano_France_v_Norway_26_June_26-056.jpg",
  },
  {
    fullName: "Theo Bernard François Hernández",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Theo_Hernandez_France_v_Spain_7.24.26-225.jpg",
  },
  {
    fullName: "Aurélien Djani Tchouaméni",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Aurelien_Tchouameni_France_v_Norway_26_June_26-101.jpg",
  },
  {
    fullName: "Adrien Rabiot",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Adrien_Rabiot_France_v_Senegal_16_June_2026-265.jpg",
  },
  {
    fullName: "Ousmane Dembélé",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Ousmane_Dembele_France_v_Senegal_16_June_2026-263.jpg",
  },
  {
    fullName: "Antoine Griezmann",
    photographer: "Biser Todorov",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Biso",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Antoine_Griezmann_in_2017_(cropped).jpg",
  },
  {
    fullName: "Kylian Mbappé Lottin",
    photographer: "Bryan Berlin",
    photographerUrl: "https://commons.wikimedia.org/wiki/User:Berlination",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Kylian_Mbappe_France_v_Senegal_16_June_2026-391_(cropped).jpg",
  },
  {
    fullName: "Olivier Giroud",
    photographer: "Антон Зайцев (Anton Zaitsev)",
    photographerUrl: "https://commons.wikimedia.org/wiki/File:Olivier_Giroud_2018.jpg",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Olivier_Giroud_2018.jpg",
  },
];

export const POSSESSION_SHAPE_PHOTO_CREDITS: PhotoCredit[] = [
  ...ARGENTINA_PHOTO_CREDITS,
  ...FRANCE_PHOTO_CREDITS,
];
