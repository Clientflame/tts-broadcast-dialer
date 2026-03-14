/**
 * NANPA Area Code → IANA Timezone Mapping
 * 
 * Maps US/Canada area codes to their primary timezone.
 * Used for per-contact timezone enforcement in the dialer.
 * 
 * Sources: NANPA area code assignments, FCC data.
 * When an area code spans multiple timezones, the most populous timezone is used.
 */

// Timezone abbreviations for compact storage
const TZ = {
  ET: "America/New_York",
  CT: "America/Chicago",
  MT: "America/Denver",
  PT: "America/Los_Angeles",
  AKT: "America/Anchorage",
  HT: "Pacific/Honolulu",
  AST: "America/Puerto_Rico", // Atlantic (PR, USVI)
} as const;

/**
 * Area code to timezone mapping.
 * This covers the major US area codes. For unlisted codes, defaults to ET.
 */
const AREA_CODE_TZ: Record<string, string> = {
  // Eastern Time
  "201": TZ.ET, "202": TZ.ET, "203": TZ.ET, "207": TZ.ET, "212": TZ.ET,
  "215": TZ.ET, "216": TZ.ET, "219": TZ.ET, "224": TZ.ET, "225": TZ.ET,
  "229": TZ.ET, "231": TZ.ET, "234": TZ.ET, "239": TZ.ET, "240": TZ.ET,
  "248": TZ.ET, "252": TZ.ET, "253": TZ.ET, "267": TZ.ET, "269": TZ.ET,
  "272": TZ.ET, "276": TZ.ET, "278": TZ.ET, "283": TZ.ET, "301": TZ.ET,
  "302": TZ.ET, "304": TZ.ET, "305": TZ.ET, "307": TZ.MT, "308": TZ.CT,
  "309": TZ.CT, "310": TZ.PT, "312": TZ.CT, "313": TZ.ET, "314": TZ.CT,
  "315": TZ.ET, "316": TZ.CT, "317": TZ.ET, "318": TZ.CT, "319": TZ.CT,
  "320": TZ.CT, "321": TZ.ET, "323": TZ.PT, "325": TZ.CT, "326": TZ.ET,
  "330": TZ.ET, "331": TZ.CT, "332": TZ.ET, "334": TZ.CT, "336": TZ.ET,
  "337": TZ.CT, "339": TZ.ET, "340": TZ.AST, "341": TZ.PT, "346": TZ.CT,
  "347": TZ.ET, "351": TZ.ET, "352": TZ.ET, "360": TZ.PT, "361": TZ.CT,
  "364": TZ.ET, "380": TZ.ET, "385": TZ.MT, "386": TZ.ET, "401": TZ.ET,
  "402": TZ.CT, "404": TZ.ET, "405": TZ.CT, "406": TZ.MT, "407": TZ.ET,
  "408": TZ.PT, "409": TZ.CT, "410": TZ.ET, "412": TZ.ET, "413": TZ.ET,
  "414": TZ.CT, "415": TZ.PT, "417": TZ.CT, "419": TZ.ET, "423": TZ.ET,
  "424": TZ.PT, "425": TZ.PT, "430": TZ.CT, "432": TZ.CT, "434": TZ.ET,
  "435": TZ.MT, "440": TZ.ET, "442": TZ.PT, "443": TZ.ET, "445": TZ.ET,
  "447": TZ.CT, "448": TZ.ET, "458": TZ.PT, "463": TZ.ET, "464": TZ.CT,
  "469": TZ.CT, "470": TZ.ET, "475": TZ.ET, "478": TZ.ET, "479": TZ.CT,
  "480": TZ.MT, "484": TZ.ET, "501": TZ.CT, "502": TZ.ET, "503": TZ.PT,
  "504": TZ.CT, "505": TZ.MT, "507": TZ.CT, "508": TZ.ET, "509": TZ.PT,
  "510": TZ.PT, "512": TZ.CT, "513": TZ.ET, "515": TZ.CT, "516": TZ.ET,
  "517": TZ.ET, "518": TZ.ET, "520": TZ.MT, "530": TZ.PT, "531": TZ.CT,
  "534": TZ.CT, "539": TZ.CT, "540": TZ.ET, "541": TZ.PT, "551": TZ.ET,
  "557": TZ.CT, "559": TZ.PT, "561": TZ.ET, "562": TZ.PT, "563": TZ.CT,
  "564": TZ.PT, "567": TZ.ET, "570": TZ.ET, "571": TZ.ET, "572": TZ.CT,
  "573": TZ.CT, "574": TZ.ET, "575": TZ.MT, "580": TZ.CT, "585": TZ.ET,
  "586": TZ.ET, "601": TZ.CT, "602": TZ.MT, "603": TZ.ET, "605": TZ.CT,
  "606": TZ.ET, "607": TZ.ET, "608": TZ.CT, "609": TZ.ET, "610": TZ.ET,
  "612": TZ.CT, "614": TZ.ET, "615": TZ.CT, "616": TZ.ET, "617": TZ.ET,
  "618": TZ.CT, "619": TZ.PT, "620": TZ.CT, "623": TZ.MT, "626": TZ.PT,
  "628": TZ.PT, "629": TZ.CT, "630": TZ.CT, "631": TZ.ET, "636": TZ.CT,
  "640": TZ.ET, "641": TZ.CT, "646": TZ.ET, "650": TZ.PT, "651": TZ.CT,
  "656": TZ.PT, "657": TZ.PT, "659": TZ.CT, "660": TZ.CT, "661": TZ.PT,
  "662": TZ.CT, "667": TZ.ET, "669": TZ.PT, "678": TZ.ET, "680": TZ.ET,
  "681": TZ.ET, "682": TZ.CT, "689": TZ.ET, "701": TZ.CT, "702": TZ.PT,
  "703": TZ.ET, "704": TZ.ET, "706": TZ.ET, "707": TZ.PT, "708": TZ.CT,
  "712": TZ.CT, "713": TZ.CT, "714": TZ.PT, "715": TZ.CT, "716": TZ.ET,
  "717": TZ.ET, "718": TZ.ET, "719": TZ.MT, "720": TZ.MT, "724": TZ.ET,
  "725": TZ.PT, "726": TZ.CT, "727": TZ.ET, "731": TZ.CT, "732": TZ.ET,
  "734": TZ.ET, "737": TZ.CT, "740": TZ.ET, "743": TZ.ET, "747": TZ.PT,
  "754": TZ.ET, "757": TZ.ET, "760": TZ.PT, "762": TZ.ET, "763": TZ.CT,
  "765": TZ.ET, "769": TZ.CT, "770": TZ.ET, "772": TZ.ET, "773": TZ.CT,
  "774": TZ.ET, "775": TZ.PT, "779": TZ.CT, "781": TZ.ET, "785": TZ.CT,
  "786": TZ.ET, "801": TZ.MT, "802": TZ.ET, "803": TZ.ET, "804": TZ.ET,
  "805": TZ.PT, "806": TZ.CT, "808": TZ.HT, "810": TZ.ET, "812": TZ.ET,
  "813": TZ.ET, "814": TZ.ET, "815": TZ.CT, "816": TZ.CT, "817": TZ.CT,
  "818": TZ.PT, "820": TZ.ET, "828": TZ.ET, "830": TZ.CT, "831": TZ.PT,
  "832": TZ.CT, "835": TZ.ET, "838": TZ.ET, "839": TZ.ET, "840": TZ.ET,
  "843": TZ.ET, "845": TZ.ET, "847": TZ.CT, "848": TZ.ET, "849": TZ.ET,
  "850": TZ.ET, "854": TZ.ET, "856": TZ.ET, "857": TZ.ET, "858": TZ.PT,
  "859": TZ.ET, "860": TZ.ET, "862": TZ.ET, "863": TZ.ET, "864": TZ.ET,
  "870": TZ.CT, "872": TZ.CT, "878": TZ.ET, "901": TZ.CT, "903": TZ.CT,
  "904": TZ.ET, "906": TZ.ET, "907": TZ.AKT, "908": TZ.ET, "909": TZ.PT,
  "910": TZ.ET, "912": TZ.ET, "913": TZ.CT, "914": TZ.ET, "915": TZ.MT,
  "916": TZ.PT, "917": TZ.ET, "918": TZ.CT, "919": TZ.ET, "920": TZ.CT,
  "925": TZ.PT, "928": TZ.MT, "929": TZ.ET, "930": TZ.ET, "931": TZ.CT,
  "934": TZ.ET, "936": TZ.CT, "937": TZ.ET, "938": TZ.CT, "940": TZ.CT,
  "941": TZ.ET, "943": TZ.ET, "945": TZ.CT, "947": TZ.ET, "949": TZ.PT,
  "951": TZ.PT, "952": TZ.CT, "954": TZ.ET, "956": TZ.CT, "959": TZ.ET,
  "970": TZ.MT, "971": TZ.PT, "972": TZ.CT, "973": TZ.ET, "975": TZ.CT,
  "978": TZ.ET, "979": TZ.CT, "980": TZ.ET, "984": TZ.ET, "985": TZ.CT,
  "986": TZ.MT, "989": TZ.ET,
};

/**
 * Look up the timezone for a US phone number based on its area code.
 * @param phoneNumber - Phone number (any format, digits extracted)
 * @returns IANA timezone string (e.g., "America/New_York")
 */
export function getTimezoneForPhone(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  // Handle 10-digit or 11-digit (with leading 1) US numbers
  let areaCode: string;
  if (digits.length === 11 && digits.startsWith("1")) {
    areaCode = digits.substring(1, 4);
  } else if (digits.length === 10) {
    areaCode = digits.substring(0, 3);
  } else {
    return TZ.ET; // Default to Eastern for non-standard numbers
  }
  return AREA_CODE_TZ[areaCode] || TZ.ET;
}

/**
 * Check if a phone number is within a callable time window based on its area code timezone.
 * @param phoneNumber - The phone number to check
 * @param windowStart - Start of call window in HH:MM format (e.g., "08:00")
 * @param windowEnd - End of call window in HH:MM format (e.g., "21:00")
 * @returns true if the contact can be called now
 */
export function isContactCallable(
  phoneNumber: string,
  windowStart: string,
  windowEnd: string,
): boolean {
  const tz = getTimezoneForPhone(phoneNumber);
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const currentTime = formatter.format(now);
    return currentTime >= windowStart && currentTime <= windowEnd;
  } catch {
    return true; // If timezone lookup fails, allow the call
  }
}

/**
 * Get the current local time for a phone number's area code timezone.
 * @param phoneNumber - The phone number
 * @returns Object with timezone name and current local time string
 */
export function getContactLocalTime(phoneNumber: string): {
  timezone: string;
  localTime: string;
  tzAbbrev: string;
} {
  const tz = getTimezoneForPhone(phoneNumber);
  const now = new Date();
  
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  
  const abbrevFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  });
  const parts = abbrevFormatter.formatToParts(now);
  const tzAbbrev = parts.find(p => p.type === "timeZoneName")?.value || tz;
  
  return {
    timezone: tz,
    localTime: timeFormatter.format(now),
    tzAbbrev,
  };
}
