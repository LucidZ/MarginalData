// Denver resident population (thousands, July 1 Census Bureau estimates),
// pulled from FRED 2026-11-03. FRED dates each value Jan 1 of its year.
//   metro: DNVPOP, Denver-Aurora-Lakewood MSA (series starts 2000)
//   city:  CODENV5POP, City and County of Denver
// https://fred.stlouisfed.org/series/DNVPOP
// https://fred.stlouisfed.org/series/CODENV5POP

export type PopArea = "metro" | "city";

export const POPULATION: Record<PopArea, Record<number, number>> = {
  metro: {
    2000: 2194.022, 2001: 2246.785, 2002: 2276.25, 2003: 2297.441, 2004: 2321.712,
    2005: 2353.518, 2006: 2399.62, 2007: 2449.476, 2008: 2500.384, 2009: 2552.195,
    2010: 2554.588, 2011: 2603.261, 2012: 2650.895, 2013: 2701.454, 2014: 2755.153,
    2015: 2814.383, 2016: 2858.489, 2017: 2893.661, 2018: 2933.991, 2019: 2964.811,
    2020: 2970.099, 2021: 2978.802, 2022: 2994.295, 2023: 3031.278, 2024: 3081.092,
    2025: 3092.037,
  },
  city: {
    1996: 527.643, 1997: 536.678, 1998: 540.893, 1999: 548.848, 2000: 556.32,
    2001: 564.61, 2002: 561.367, 2003: 558.968, 2004: 558.846, 2005: 561.57,
    2006: 568.763, 2007: 578.832, 2008: 592.88, 2009: 609.026, 2010: 603.012,
    2011: 620.25, 2012: 634.965, 2013: 649.27, 2014: 664.54, 2015: 683.328,
    2016: 696.273, 2017: 704.869, 2018: 716.34, 2019: 725.508, 2020: 717.68,
    2021: 712.156, 2022: 716.8, 2023: 726.763, 2024: 741.591, 2025: 740.613,
  },
};

export const POP_LABEL: Record<PopArea, string> = {
  metro: "Denver metro",
  city: "City of Denver",
};
