// Known-good values verified against manual AppSync queries.
// Update these if the underlying dataset changes.

export const CV2_PROFILE = {
  district:   "CV2",
  name:       "Rugby",
  tam:        801_198_497.8,
  gdhi:       29_176.93,
  population: 68_120,
  households: 27_019,
};

// 2023 Q1, destination mode — gerçek AppSync cardholderIndexSpend değerleri
// cardholderIndexSpend = CV2 işletmelerine gelen müşteri trafiğinin kaynak district yüzdesi
export const CV2_INFLOW_TOP3 = [
  { location: "CV2", spendIndex: 17.184 },
  { location: "CV6", spendIndex:  5.362 },
];

// topN:50 ile ölçülen kısmi TOM (~£291M). Tam TOM (topN:1000) ~£303M ama timeout'a giriyor.
export const CV2_TOM_2023Q1 = {
  min: 280_000_000,
  max: 300_000_000,
};

// getInflowTAMSummary result verified against manual query
export const CV2_INFLOW_SUMMARY_2023Q1 = {
  sourceCount:    683,
  totalSourceTAM: 372_555_238_451,  // sum of all 683 source district TAMs
};
