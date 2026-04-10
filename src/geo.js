import { AREA_CODES, REGION_CODES } from './phoneCodes.js';
import {
  TCPA_QUIET_HOURS,
  CRTC_QUIET_HOURS,
  CRTC_STATES,
} from './compliance.js';
import {
  STATE_TIMEZONES,
  STATES_WITH_MULTIPLE_TIMEZONES,
} from './timezones.js';
import {
  STATES_THAT_DONT_HAVE_DAYLIGHT_SAVINGS,
  AREA_CODES_WITH_MULTIPLE_DAYLIGHT_SAVINGS,
} from './daylightSavings.js';
import { findNumbersInString } from './base.js';

/**
 * Parses an ISO-style UTC offset string into a signed minute count.
 *
 * @param {string} offset - Offset in the format `±HH:MM`.
 * @returns {number} Signed offset in minutes.
 */
function parseOffsetMinutes(offset) {
  const match = String(offset).match(/^([+-]?)(\d{1,2}):(\d{2})$/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3], 10);

  return sign * (hours * 60 + minutes);
}

/**
 * Pads a single time component to two digits.
 *
 * @param {number} value - Time component to format.
 * @returns {string} Two-digit string representation.
 */
function formatClockValue(value) {
  return String(value).padStart(2, '0');
}

/**
 * Converts a signed minute count into an ISO-style UTC offset string.
 *
 * @param {number} totalMinutes - Signed offset in minutes.
 * @returns {string} Offset in the format `±HH:MM`.
 */
function formatOffsetFromMinutes(totalMinutes) {
  const sign = totalMinutes < 0 ? '-' : '+';
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${sign}${formatClockValue(hours)}:${formatClockValue(minutes)}`;
}

/**
 * Formats a UTC-shifted date as a 24-hour time string without relying on the host timezone.
 *
 * @param {Date} localTime - Date already shifted into the target local time.
 * @returns {string} Time in `HH:MM:SS` format.
 */
function formatLocalTime24Hour(localTime) {
  return [
    formatClockValue(localTime.getUTCHours()),
    formatClockValue(localTime.getUTCMinutes()),
    formatClockValue(localTime.getUTCSeconds()),
  ].join(':');
}

/**
 * Formats a UTC-shifted date as a 12-hour clock string without relying on locale defaults.
 *
 * @param {Date} localTime - Date already shifted into the target local time.
 * @returns {string} Time in `h:MM:SS AM/PM` format.
 */
function formatLocalTimeReadable(localTime) {
  const hours = localTime.getUTCHours();
  const minutes = formatClockValue(localTime.getUTCMinutes());
  const seconds = formatClockValue(localTime.getUTCSeconds());
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const readableHour = hours % 12 || 12;

  return `${readableHour}:${minutes}:${seconds} ${suffix}`;
}

/**
 * Shifts a UTC offset by a whole number of hours while preserving minute precision.
 *
 * @param {string} offset - Offset in the format `±HH:MM`.
 * @param {number} hours - Whole hours to add.
 * @returns {string} Shifted offset in the format `±HH:MM`.
 */
function shiftOffsetByHours(offset, hours) {
  return formatOffsetFromMinutes(parseOffsetMinutes(offset) + hours * 60);
}

/**
 * Removes duplicate offsets while normalizing them into ISO-style strings.
 *
 * @param {string[]} offsets - Candidate offsets.
 * @returns {string[]} Unique, normalized offsets.
 */
function dedupeOffsets(offsets) {
  const seen = new Set();

  return offsets.filter((offset) => {
    const formattedOffset = formatTimeOffset(offset);

    if (seen.has(formattedOffset)) {
      return false;
    }

    seen.add(formattedOffset);
    return true;
  });
}

/**
 * Finds the calendar day for an nth weekday occurrence within a UTC month.
 *
 * @param {number} year - Full year.
 * @param {number} monthIndex - Zero-based month index.
 * @param {number} weekday - UTC weekday where Sunday is `0`.
 * @param {number} occurrence - Nth occurrence to locate.
 * @returns {number} Day of month.
 */
function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const dayOffset = (weekday - firstDay + 7) % 7;

  return 1 + dayOffset + (occurrence - 1) * 7;
}

/**
 * Applies a UTC offset to a date and returns a UTC-backed local clock representation.
 *
 * @param {string} offset - Offset in the format `±HH:MM`.
 * @param {Date} date - UTC timestamp to shift.
 * @returns {Date} Shifted date whose UTC getters reflect the target local time.
 */
function getLocalTimeForOffset(offset, date) {
  return new Date(date.getTime() + parseOffsetMinutes(offset) * 60000);
}

/**
 * Resolves the baseline timezone offsets for an area code before DST adjustments are applied.
 *
 * @param {string} areaCode - NANP area code.
 * @param {string} stateName - State, province, or territory lookup key.
 * @returns {string[]} Candidate standard offsets for the area code.
 */
function getBaseOffsetsForAreaCode(areaCode, stateName) {
  const stateTimezones = STATES_WITH_MULTIPLE_TIMEZONES[stateName]?.[areaCode];

  if (Array.isArray(stateTimezones)) {
    return stateTimezones.map((offset) => formatTimeOffset(offset));
  }

  if (stateTimezones) {
    return [formatTimeOffset(stateTimezones)];
  }

  return STATE_TIMEZONES[stateName]
    ? [formatTimeOffset(STATE_TIMEZONES[stateName])]
    : [];
}

/**
 * Builds the possible offsets for an area code at a specific instant, including DST variants.
 *
 * @param {string} areaCode - NANP area code.
 * @param {string} stateName - State, province, or territory lookup key.
 * @param {Date} date - Instant being evaluated.
 * @returns {string[]} Candidate offsets ordered from earlier to later local time.
 */
function getCandidateOffsets(areaCode, stateName, date) {
  const baseOffsets = getBaseOffsetsForAreaCode(areaCode, stateName);
  const hasMixedDaylightSavings =
    !!AREA_CODES_WITH_MULTIPLE_DAYLIGHT_SAVINGS[areaCode];
  const observesDaylightSavings =
    !STATES_THAT_DONT_HAVE_DAYLIGHT_SAVINGS.includes(stateName);
  const standardOffset = baseOffsets[0];
  const daylightSavingsApplies =
    (observesDaylightSavings || hasMixedDaylightSavings) &&
    isDaylightSavingTime(date, standardOffset);

  if (!baseOffsets.length) {
    return [];
  }

  if (hasMixedDaylightSavings && daylightSavingsApplies) {
    return dedupeOffsets([
      ...baseOffsets.map((offset) => shiftOffsetByHours(offset, 1)),
      ...baseOffsets,
    ]);
  }

  if (observesDaylightSavings && daylightSavingsApplies) {
    return dedupeOffsets(
      baseOffsets.map((offset) => shiftOffsetByHours(offset, 1)),
    );
  }

  return dedupeOffsets(baseOffsets);
}

/**
 * Determines whether the given date is within daylight saving time for the local time zone.
 *
 * This function compares the timezone offsets of January 1st and July 1st of the given year.
 * If the current date's timezone offset is less than the maximum of these offsets,
 * it indicates that daylight saving time is in effect.
 *
 * @param {Date} [date=new Date()] - The date to check. Defaults to the current date if not provided.
 * @param {string} [standardOffset] - Optional standard UTC offset for North American DST-aware calculations.
 * @returns {boolean} - Returns true if the date is within daylight saving time, false otherwise.
 */
export function isDaylightSavingTime(date = new Date(), standardOffset) {
  if (standardOffset) {
    const localStandardTime = getLocalTimeForOffset(standardOffset, date);
    const year = localStandardTime.getUTCFullYear();
    const dstStartDay = nthWeekdayOfMonth(year, 2, 0, 2);
    const dstEndDay = nthWeekdayOfMonth(year, 10, 0, 1);
    const localTimestamp = Date.UTC(
      year,
      localStandardTime.getUTCMonth(),
      localStandardTime.getUTCDate(),
      localStandardTime.getUTCHours(),
      localStandardTime.getUTCMinutes(),
      localStandardTime.getUTCSeconds(),
      localStandardTime.getUTCMilliseconds(),
    );
    const dstStart = Date.UTC(year, 2, dstStartDay, 2, 0, 0, 0);
    const dstEnd = Date.UTC(year, 10, dstEndDay, 2, 0, 0, 0);

    return localTimestamp >= dstStart && localTimestamp < dstEnd;
  }

  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const stdTimezoneOffset = Math.max(
    jan.getTimezoneOffset(),
    jul.getTimezoneOffset(),
  );
  return date.getTimezoneOffset() < stdTimezoneOffset;
}

/**
 * Formats a time offset string to ensure it complies with ISO 8601 by padding the hour component with leading zeros if necessary.
 *
 * This function takes a time offset string (e.g., "-8:00" or "+8:00") and ensures the hour part is always two digits (e.g., "-08:00" or "+08:00").
 *
 * @param {string} offset - The time offset string to format, in the format "±H:MM".
 * @returns {string} - The formatted time offset string in the format "±HH:MM".
 */
export function formatTimeOffset(offset) {
  const offsetParts = offset.split(':');
  const sign = offsetParts[0].startsWith('-') ? '-' : '+';
  const hour = offsetParts[0].replace(sign, '');

  return sign + [hour.padStart(2, '0'), offsetParts[1]].join(':');
}

/**
 * Determines the appropriate timezone offset when there are multiple possibilities, based on the time of day.
 *
 * When given a list of timezones for an area code that spans multiple timezones, this function biases the selection
 * based on the time of day. If the local time is in the morning (before 12:00 PM), it selects the earlier timezone.
 * If the local time is in the afternoon or later (12:00 PM or later), it selects the later timezone.
 *
 * @param {Array<string>} timezones - An array of timezone offsets (e.g., ["-08:00", "-07:00"]).
 * @param {Date} date - The date object used to determine the local time.
 * @returns {string} - The selected timezone offset based on the time of day.
 */
export function offsetTieBreaker(timezones, date) {
  const localTime = date.toLocaleTimeString('en-US', { hour12: false });
  const localHour = parseInt(localTime.split(':')[0]);

  if (localHour < 12) {
    return timezones[0];
  } else {
    return timezones[timezones.length - 1];
  }
}

/**
 * Calculates local time details based on a given UTC offset and date.
 *
 * @param {string} offset - The UTC offset in the format "+HH:MM" or "-HH:MM".
 * @param {Date} date - The date object for which to calculate the local time.
 * @param {string} stateName - The state in which the area code is located.
 * @returns {Object} An object containing local time details.
 * @returns {string} return.localTimeReadable - The local time as a readable string in 12-hour format.
 * @returns {string} return.localTime24Hour - The local time as a string in 24-hour format.
 * @returns {boolean} return.isTCPAQuietHours - Indicates whether the local time falls outside TCPA quiet hours (US).
 * @returns {boolean} return.isCRTCQuietHours - Indicates whether the local time falls outside CRTC quiet hours (Canada).
 * @returns {boolean} return.isQuietHours - Indicates whether the local time falls outside either TCPA or CRTC quiet hours.
 */
export function findTimeDetails(offset, date, stateName) {
  const localTime = getLocalTimeForOffset(offset, date);
  const localDay = localTime.getUTCDay();
  const localHour = localTime.getUTCHours();
  const localMinutes = localHour * 60 + localTime.getUTCMinutes();
  // CRTC Info
  const isWeekend = localDay === 0 || localDay === 6;
  const isCRTCRegion = CRTC_STATES.indexOf(stateName) !== -1;

  let timeDetails = {
    localTimeReadable: formatLocalTimeReadable(localTime),
    localTime24Hour: formatLocalTime24Hour(localTime),
  };

  if (isCRTCRegion) {
    const startMinutes = isWeekend
      ? CRTC_QUIET_HOURS.weekends.start * 60
      : CRTC_QUIET_HOURS.weekdays.start * 60;
    const endMinutes = isWeekend
      ? CRTC_QUIET_HOURS.weekends.end * 60
      : CRTC_QUIET_HOURS.weekdays.end * 60;

    if (isWeekend) {
      timeDetails.isCRTCQuietHours = !(
        localMinutes >= startMinutes && localMinutes < endMinutes
      );
    } else {
      timeDetails.isCRTCQuietHours = !(
        localMinutes >= startMinutes && localMinutes < endMinutes
      );
    }
  } else {
    timeDetails.isTCPAQuietHours = !(
      localHour >= TCPA_QUIET_HOURS.start && localHour < TCPA_QUIET_HOURS.end
    );
  }

  timeDetails.isQuietHours = !!(
    timeDetails.isTCPAQuietHours || timeDetails.isCRTCQuietHours
  );

  return timeDetails;
}

/**
 * Finds the formatted time offset for a given area code and state, considering daylight saving time and multiple timezones.
 *
 * This function determines the correct timezone offset for a given area code and state. It accounts for states with multiple
 * timezones and biases the selection based on the time of day. It also adjusts for daylight saving time if applicable.
 *
 * @param {string} areaCode - The valid area code to determine the timezone for.
 * @param {Date} [date=new Date()] - The date object used to determine the local time and daylight saving time. Defaults to the current date if not provided.
 * @returns {string} - The formatted timezone offset in the format "±HH:MM".
 */
export function findTimeFromAreaCode(areaCode, date = new Date()) {
  const stateName = AREA_CODES[areaCode]?.name;
  const hasMixedDaylightSavings =
    !!AREA_CODES_WITH_MULTIPLE_DAYLIGHT_SAVINGS[areaCode];
  const stateTimezones = STATES_WITH_MULTIPLE_TIMEZONES[stateName]?.[areaCode];
  let returnTime = {
    timezoneOffset: null,
    stateHasMultipleTimezones: null,
    areaCodeHasMultipleTimezones: null,
    daylightSavings: null,
    estimatedTime: false,
  };

  if (AREA_CODES[areaCode]) {
    returnTime.state = {
      name: AREA_CODES[areaCode].name,
      code: AREA_CODES[areaCode].code,
    };

    returnTime.region = {
      name: AREA_CODES[areaCode].region.name,
      code: AREA_CODES[areaCode].region.code,
      flag: AREA_CODES[areaCode].region.flag,
    };
  }

  if (!stateName || !STATE_TIMEZONES[stateName]) {
    return returnTime;
  }

  if (STATES_WITH_MULTIPLE_TIMEZONES[stateName] && stateTimezones) {
    returnTime.stateHasMultipleTimezones = true;
    returnTime.areaCodeHasMultipleTimezones = Array.isArray(stateTimezones);
    returnTime.estimatedTime = Array.isArray(stateTimezones);
  } else {
    returnTime.stateHasMultipleTimezones =
      !!STATES_WITH_MULTIPLE_TIMEZONES[stateName];
    returnTime.areaCodeHasMultipleTimezones = false;
  }

  const candidateOffsets = getCandidateOffsets(areaCode, stateName, date);
  const localOffset =
    candidateOffsets.length > 1
      ? offsetTieBreaker(candidateOffsets, date)
      : candidateOffsets[0];

  returnTime.daylightSavings =
    (hasMixedDaylightSavings ||
      !STATES_THAT_DONT_HAVE_DAYLIGHT_SAVINGS.includes(stateName)) &&
    isDaylightSavingTime(date, STATE_TIMEZONES[stateName]);
  returnTime.estimatedTime =
    returnTime.estimatedTime ||
    (hasMixedDaylightSavings && returnTime.daylightSavings) ||
    candidateOffsets.length > 1;
  returnTime.timezoneOffset = localOffset || null;

  if (!localOffset) {
    return returnTime;
  }

  returnTime = {
    ...returnTime,
    ...findTimeDetails(localOffset, date, stateName),
  };

  return returnTime;
}

/**
 * Finds and returns the region name corresponding to a given region code.
 *
 * @param {string} regionCode - The code representing the region.
 * @param {string} areaCode - Optionally, the area code if regionCode is 1 - to distinguish between US, Canada and other NANP regions.
 * @returns {Object} An object containing local region details.
 * @returns {string | undefined} The name of the region if found, otherwise `undefined`.
 * @returns {string | undefined} The 2-letter code of the region if found, otherwise `undefined`.
 * @returns {string | undefined} The emoji flag of the region if found, otherwise `undefined`.
 */
export function findRegionFromRegionCode(regionCode, areaCode) {
  const regionInfo = REGION_CODES[regionCode];

  // Region 1 is unique that it covers US, Canada as well as a number of NANP countries that do not have states.
  if (parseInt(regionCode, 10) === 1 && areaCode) {
    const stateInfo = AREA_CODES[areaCode];

    return {
      ...regionInfo,
      name: stateInfo.region.name,
      code: stateInfo.region.code,
      flag: stateInfo.region.flag,
    };
  }

  return regionInfo;
}

/**
 * Finds all phone numbers in a string and adds in geographical and/or time zone information to that object.
 *
 * @param {string} text - The text to search for phone numbers.
 * @param {Date} [date=new Date()] - The date to use for determining time zone information. Defaults to the current date.
 * @returns {Array<object>} An array of objects, where each object represents a found phone number
 * and includes details from `findNumbersInString` as well as geographical and/or time zone information.
 */
export function findAllNumbersInfoInString(text, date = new Date()) {
  const numbers = findNumbersInString(text);

  return numbers.map((item) => {
    const geo = item.areaCode
      ? findTimeFromAreaCode(item.areaCode, date)
      : findRegionFromRegionCode(item.regionCode);
    return { ...item, ...geo };
  });
}
