/**
 * TCPA calling window for US-number quiet hours, expressed in local whole hours.
 *
 * @type {{start: number, end: number}}
 */
export const TCPA_QUIET_HOURS = {
  start: 8,
  end: 21,
};

/**
 * CRTC calling window for Canadian-number quiet hours, expressed in local hours.
 * Fractional values are used for half-hour boundaries such as 9:30 PM.
 *
 * @type {{weekdays: {start: number, end: number}, weekends: {start: number, end: number}}}
 */
export const CRTC_QUIET_HOURS = {
  weekdays: {
    start: 9,
    end: 21.5,
  },
  weekends: {
    start: 10,
    end: 18,
  },
};

/**
 * Province and territory names that should use CRTC quiet-hour rules.
 *
 * The strings in this list must match the `name` field used in `AREA_CODES`.
 *
 * @type {string[]}
 */
export const CRTC_STATES = [
  'Canadian Special Services',
  'Alberta',
  'British Columbia',
  'Manitoba',
  'New Brunswick',
  'Newfoundland and Labrador',
  'Northwest Territories',
  'Nova Scotia',
  'Nunavut',
  'Ontario',
  'Nova Scotia and Prince Edward Island',
  'Quebec',
  'Saskatchewan',
  'Yukon',
  'Yukon, Northwest Territories, and Nunavut',
];
