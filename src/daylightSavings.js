/**
 * Regions whose default local time should not be shifted for daylight saving time.
 *
 * @type {string[]}
 */
export const STATES_THAT_DONT_HAVE_DAYLIGHT_SAVINGS = [
  'Arizona',
  'Hawaii',
  'British Columbia',
  'Puerto Rico',
  'Saskatchewan',
  'Virgin Islands',
];

/**
 * Area codes whose footprint includes both DST-observing and non-DST-observing subregions.
 *
 * @type {Record<string, string>}
 */
export const AREA_CODES_WITH_MULTIPLE_DAYLIGHT_SAVINGS = {
  928: 'Arizona',
  236: 'British Columbia',
  250: 'British Columbia',
  257: 'British Columbia',
  672: 'British Columbia',
  778: 'British Columbia',
  306: 'Saskatchewan',
  474: 'Saskatchewan',
  639: 'Saskatchewan',
  867: 'Yukon, Northwest Territories, and Nunavut',
};
