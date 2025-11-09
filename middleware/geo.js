// backend/middleware/geo.js

const { getPool } = require('../config/db');

const RATE_HOURS = 12;

const KENYA_COUNTIES = {
  'NAIROBI': ['Nairobi', 'Westlands', 'Kilimani', 'Kasarani', 'Embakasi', 'Dagoretti', 'Langata', 'Karen', 'Ngara', 'Parklands', 'Lavington', 'Runda', 'Muthaiga', 'South B', 'South C', 'Roysambu', 'Kileleshwa', 'Hurlingham', 'Upperhill', 'Kibera', 'Mathare', 'Donholm', 'Buruburu', 'Umoja', 'Kayole', 'Komarock'],
  'MOMBASA': ['Mombasa', 'Nyali', 'Bamburi', 'Shanzu', 'Kisauni', 'Likoni', 'Changamwe', 'Jomvu', 'Port Reitz', 'Tudor', 'Buxton', 'Mikindani'],
  'KILIFI': ['Kilifi', 'Malindi', 'Watamu', 'Mtwapa', 'Gongoni', 'Mida', 'Gede', 'Kaloleni', 'Mariakani', 'Mazeras', 'Vipingo', 'Takaungu'],
  'KWALE': ['Kwale', 'Ukunda', 'Diani', 'Msambweni', 'Kinango', 'Lunga Lunga'],
  'LAMU': ['Lamu', 'Mpeketoni', 'Witu', 'Faza', 'Kizingitini'],
  'TAITA TAVETA': ['Voi', 'Taveta', 'Wundanyi', 'Mwatate', 'Bura'],
  'TANA RIVER': ['Hola', 'Garsen', 'Bura', 'Madogo', 'Kipini'],
  
  'KISUMU': ['Kisumu', 'Kondele', 'Mamboleo', 'Maseno', 'Ahero', 'Awasi', 'Kibos', 'Dunga', 'Nyalenda', 'Obunga', 'Manyatta', 'Milimani'],
  'SIAYA': ['Siaya', 'Bondo', 'Ugunja', 'Yala', 'Ukwala'],
  'KISII': ['Kisii', 'Ogembo', 'Keroka', 'Suneka', 'Nyamache'],
  'NYAMIRA': ['Nyamira', 'Keroka', 'Nyansiongo', 'Manga', 'Borabu'],
  'HOMA BAY': ['Homa Bay', 'Mbita', 'Ndhiwa', 'Oyugis', 'Kendu Bay'],
  'MIGORI': ['Migori', 'Rongo', 'Awendo', 'Kehancha', 'Isebania'],
  'BUSIA': ['Busia', 'Malaba', 'Bumala', 'Matayos', 'Nambale'],
  
  'NAKURU': ['Nakuru', 'Naivasha', 'Gilgil', 'Molo', 'Njoro', 'Rongai', 'Kampi Ya Moto', 'Subukia', 'Bahati', 'London', 'Lanet', 'Pipeline'],
  'KAJIADO': ['Kajiado', 'Ngong', 'Kitengela', 'Rongai', 'Isinya', 'Loitokitok', 'Ongata Rongai', 'Kiserian', 'Magadi', 'Namanga', 'Bissil'],
  'NAROK': ['Narok', 'Kilgoris', 'Mau Narok', 'Suswa', 'Ololulunga'],
  'BARINGO': ['Kabarnet', 'Marigat', 'Eldama Ravine', 'Mogotio', 'Baringo'],
  'ELGEYO MARAKWET': ['Iten', 'Kapsowar', 'Kapcherop', 'Tambach', 'Chepkorio'],
  'KERICHO': ['Kericho', 'Litein', 'Londiani', 'Kipkelion', 'Fort Ternan'],
  'BOMET': ['Bomet', 'Sotik', 'Longisa', 'Mulot', 'Sigor'],
  'NANDI': ['Kapsabet', 'Mosoriot', 'Nandi Hills', 'Kobujoi', 'Kabiyet'],
  'TRANS NZOIA': ['Kitale', 'Kiminini', 'Endebess', 'Kwanza', 'Cherangany'],
  'WEST POKOT': ['Kapenguria', 'Makutano', 'Chepareria', 'Sigor', 'Ortum'],
  'SAMBURU': ['Maralal', 'Baragoi', 'Wamba', 'Archers Post', 'Barsaloi'],
  'LAIKIPIA': ['Nanyuki', 'Nyahururu', 'Rumuruti', 'Sipili', 'Doldol'],
  
  'UASIN GISHU': ['Eldoret', 'Turbo', 'Burnt Forest', 'Moiben', 'Kesses', 'Ziwa', 'Iten', 'Langas', 'Pioneer', 'Kipkaren', 'Kapseret', 'Ainabkoi'],
  
  'KIAMBU': ['Kiambu', 'Thika', 'Ruiru', 'Kikuyu', 'Gachie', 'Two Rivers', 'Limuru', 'Juja', 'Kahawa', 'Githunguri', 'Kabete', 'Karuri', 'Kiambu Town'],
  'MURANG\'A': ['Murang\'a', 'Kenol', 'Kangema', 'Maragua', 'Gatanga', 'Sabasaba', 'Makuyu', 'Kandara', 'Kigumo', 'Kahuro'],
  'KIRINYAGA': ['Kerugoya', 'Kutus', 'Sagana', 'Baricho', 'Wang\'uru'],
  'NYERI': ['Nyeri', 'Karatina', 'Othaya', 'Mweiga', 'Nanyuki', 'Endarasha', 'Mukuruweini', 'Tetu', 'Mathira', 'Kieni', 'Narumoru'],
  'NYANDARUA': ['Ol Kalou', 'Nyahururu', 'Engineer', 'Shamata', 'Ndaragwa'],
  
  'MACHAKOS': ['Machakos', 'Athi River', 'Mlolongo', 'Kangundo', 'Tala', 'Masii', 'Kathiani', 'Matungulu', 'Mwala', 'Yatta', 'Syokimau'],
  'MAKUENI': ['Wote', 'Makindu', 'Kibwezi', 'Emali', 'Mtito Andei'],
  'KITUI': ['Kitui', 'Mwingi', 'Mutomo', 'Ikutha', 'Kyuso'],
  
  'KAKAMEGA': ['Kakamega', 'Mumias', 'Butere', 'Malava', 'Khayega', 'Luanda', 'Sabatia', 'Shinyalu', 'Ikolomani', 'Shianda', 'Mahiakalo'],
  'VIHIGA': ['Mbale', 'Majengo', 'Luanda', 'Hamisi', 'Chavakali'],
  'BUNGOMA': ['Bungoma', 'Webuye', 'Chwele', 'Kimilili', 'Milo', 'Misikhu', 'Bokoli', 'Sirisia', 'Bumala', 'Kanduyi', 'Kabuchai'],
  
  'MERU': ['Meru', 'Maua', 'Mikinduri', 'Nanyuki', 'Nkubu', 'Kionyo', 'Chogoria', 'Timau', 'Meru Town', 'Kiirua', 'Tigania'],
  'THARAKA NITHI': ['Chuka', 'Chogoria', 'Kathwana', 'Marimanti', 'Magumoni'],
  'EMBU': ['Embu', 'Siakago', 'Runyenjes', 'Kiritiri', 'Ishiara'],
  
  'MARSABIT': ['Marsabit', 'Moyale', 'Loiyangalani', 'Sololo', 'Laisamis'],
  'ISIOLO': ['Isiolo', 'Merti', 'Garbatulla', 'Kinna', 'Sericho'],
  'GARISSA': ['Garissa', 'Dadaab', 'Hulugho', 'Masalani', 'Modogashe'],
  'WAJIR': ['Wajir', 'Buna', 'Habaswein', 'Tarbaj', 'Griftu'],
  'MANDERA': ['Mandera', 'Rhamu', 'Elwak', 'Takaba', 'Banisa'],
  
  'TURKANA': ['Lodwar', 'Kakuma', 'Kalokol', 'Lokichoggio', 'Lokitaung']
};

const EAST_AFRICA = ['Uganda', 'Tanzania', 'Rwanda', 'Burundi', 'South Sudan', 'Kampala', 'Dar es Salaam', 'Kigali', 'Bujumbura', 'Juba', 'Arusha', 'Mwanza', 'Dodoma', 'Entebbe', 'Mbarara', 'Zanzibar', 'Mbeya', 'Morogoro', 'Tanga', 'Bukoba'];

const AFRICA = ['Nigeria', 'South Africa', 'Egypt', 'Ethiopia', 'Ghana', 'Morocco', 'Algeria', 'Tunisia', 'Senegal', 'Zimbabwe', 'Zambia', 'Mozambique', 'Botswana', 'Namibia', 'Mali', 'Sudan', 'Somalia', 'Libya', 'Angola', 'Cameroon', 'Ivory Coast', 'Madagascar', 'Malawi', 'Mauritius', 'Congo', 'DRC', 'Chad', 'Niger', 'Benin', 'Togo', 'Gabon', 'Lesotho', 'Swaziland', 'Eritrea', 'Djibouti', 'Gambia', 'Guinea', 'Sierra Leone', 'Liberia', 'Burkina Faso'];

const GLOBAL = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'China', 'India', 'Japan', 'Brazil', 'Mexico', 'Spain', 'Italy', 'Netherlands', 'Sweden', 'Switzerland', 'Singapore', 'Dubai', 'UAE', 'Russia', 'Poland', 'Belgium', 'Austria', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Portugal', 'Greece', 'New Zealand', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela', 'Thailand', 'Malaysia', 'Indonesia', 'Philippines', 'Vietnam', 'South Korea', 'Saudi Arabia', 'Turkey', 'Israel', 'Pakistan', 'Bangladesh'];

const matchCountyFromCity = (city) => {
  if (!city) return null;
  const normalizedCity = city.trim().toUpperCase();
  
  for (const county in KENYA_COUNTIES) {
    if (KENYA_COUNTIES[county].some(town => town.toUpperCase() === normalizedCity)) {
      return county;
    }
  }
  return null;
};

const categorizeLocation = (city, region, country) => {
  let county = null;
  let town = null;
  let category = 'UNKNOWN';

  if (city) {
    town = city;
    county = matchCountyFromCity(city);
    if (county) {
      category = 'KENYA';
      return { county, town, category };
    }
  }

  if (region) {
    county = matchCountyFromCity(region);
    if (county) {
      category = 'KENYA';
      town = town || region;
      return { county, town, category };
    }
  }

  const normalizedCity = city ? city.toUpperCase() : '';
  const normalizedRegion = region ? region.toUpperCase() : '';
  const normalizedCountry = country ? country.toUpperCase() : '';

  if (normalizedCountry === 'KE' || normalizedCountry === 'KENYA') {
    category = 'KENYA';
    county = 'KENYA';
    town = city || region || 'Kenya';
    return { county, town, category };
  }

  if (EAST_AFRICA.some(loc => 
    normalizedCity.includes(loc.toUpperCase()) || 
    normalizedRegion.includes(loc.toUpperCase()) || 
    normalizedCountry.includes(loc.toUpperCase())
  )) {
    category = 'EAST_AFRICA';
    county = 'EAST_AFRICA';
    town = city || region || country;
    return { county, town, category };
  }

  if (AFRICA.some(loc => 
    normalizedCity.includes(loc.toUpperCase()) || 
    normalizedRegion.includes(loc.toUpperCase()) || 
    normalizedCountry.includes(loc.toUpperCase())
  )) {
    category = 'AFRICA';
    county = 'AFRICA';
    town = city || region || country;
    return { county, town, category };
  }

  if (GLOBAL.some(loc => 
    normalizedCity.includes(loc.toUpperCase()) || 
    normalizedRegion.includes(loc.toUpperCase()) || 
    normalizedCountry.includes(loc.toUpperCase())
  )) {
    category = 'GLOBAL';
    county = 'GLOBAL';
    town = city || region || country;
    return { county, town, category };
  }

  category = 'GLOBAL';
  county = 'GLOBAL';
  town = city || region || country || 'Unknown';
  
  return { county, town, category };
};

const geoMiddleware = async (req, res, next) => {
  try {
    const sessionId = req.session?.id || req.sessionID;
    const cfCity = req.headers['cf-ipcity'] || null;
    const cfRegion = req.headers['cf-region'] || null;
    const cfCountry = req.headers['cf-ipcountry'] || null;
    const cfTimezone = req.headers['cf-timezone'] || null;
    const cfLatitude = req.headers['cf-iplatitude'] || null;
    const cfLongitude = req.headers['cf-iplongitude'] || null;

    const geoData = categorizeLocation(cfCity, cfRegion, cfCountry);
    
    req.geo = {
      county: geoData.county,
      town: geoData.town,
      category: geoData.category,
      raw: {
        city: cfCity,
        region: cfRegion,
        country: cfCountry,
        timezone: cfTimezone,
        latitude: cfLatitude,
        longitude: cfLongitude
      }
    };

    if (sessionId && (geoData.county || geoData.town)) {
      const pool = getPool();
      
      try {
        const resRow = await pool.query(
          `SELECT last_seen FROM session_geo WHERE session_id = $1`,
          [sessionId]
        );
        
        let doUpdate = true;
        if (resRow.rowCount > 0) {
          const last = resRow.rows[0].last_seen;
          const diffMs = Date.now() - new Date(last).getTime();
          if (diffMs < RATE_HOURS * 3600 * 1000) doUpdate = false;
        }
        
        if (doUpdate) {
          await pool.query(
            `INSERT INTO session_geo (session_id, county, town, category, raw_data, last_seen, first_seen, visit_count)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1)
             ON CONFLICT (session_id) DO UPDATE
               SET county = EXCLUDED.county,
                   town = EXCLUDED.town,
                   category = EXCLUDED.category,
                   raw_data = EXCLUDED.raw_data,
                   last_seen = NOW(),
                   visit_count = session_geo.visit_count + 1`,
            [sessionId, geoData.county, geoData.town, geoData.category, JSON.stringify(req.geo.raw)]
          );
        }
      } catch (e) {
        console.error('Geo middleware DB error:', e);
      }
    }
  } catch (error) {
    console.error('Geo middleware critical error:', error);
    req.geo = { county: null, town: null, category: 'UNKNOWN', raw: {} };
  }

  next();
};

module.exports = geoMiddleware;