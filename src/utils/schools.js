export const SCHOOL_OPTIONS = [
  "ALL SCHOOLS",

  // ELEMENTARY
  "Isabela East Central Elementary School",
  "Isabela Bliss Elementary School",
  "Bishop Querexeta Elementary School",
  "Kaumpurnah Elementary School",
  "Simeon & Josefa Obsequio Elementary School",
  "Begang Central Elementary School",
  "Busay Elementary School",
  "Tabiawan Elementary School",
  "Latuan Elementary School",
  "Panunsulan Elementary School",
  "Kawa-Kawa Elementary School",
  "Look-Jambangan Elementary School",
  "Kauman Ekka Elementary School",
  "Palasanan Primary School",
  "Spillway Elementary School",
  "Kapatagan Diutay Elementary School",
  "Hadji Camlani Elementary School",
  "Calvario Peak Elementary School",
  "Calvario Elementary School",
  "Masola Elementary School",
  "Lanote Elementary School",
  "Lunot Elementary School",
  "Cabunbata Elementary School",
  "Isabela Central Pilot Elementary School",
  "Isabela Central Pilot Elementary School - Night",
  "Westside Elementary School",
  "Ustadz Wahab Akbar Elementary School",
  "Sunset Elementary School",
  "Ajibon Elementary School",
  "Sumagdang Elementary School",
  "Kumalarang Elementary School",
  "Maligue Elementary School",
  "Old Camp Elementary School",
  "Menzi Elementary School",
  "Balatanay Elementary School",
  "Balawatin Elementary School",
  "Makiri Elementary School",
  "NR Hugo Elementary School",
  "Campo Barn Elementary School",
  "Hadji Maulana Primary School",
  "Caro Elementary School",
  "Malamawi Central Elementary School",
  "Tampalan Elementary School",
  "Diki Elementary School",
  "Marang Marang Elementary School",
  "Lukbuton Elementary School",
  "Hadji Amilhamja Lahaba Memorial Elementary School",
  "MS Bernardo Elementary School",
  "Lampinigan Elementary School",
  "Ismael Integrated School",
  "Panigayan Integrated School",
  "Badjao Floating Integrated School",
  "Geras Integrated School",

  // HIGH SCHOOL
  "Basilan National High School",
  "Basilan National High School - Night",
  "Baluno National High School",
  "Malamawi National High School",
  "Begang National High School",
  "Isabela City National High School",
  "Kumalarang National High School",
  "Ismael Integrated School (High School)",
  "Lampinigan National High School",
  "Tandung Ahas National High School",
  "Panigayan Integrated School (High School)",
  "Badjao Floating Integrated School (High School)",
  "Geras Integrated School (High School)",
  "Caro National High School",
];

// Official DepEd School IDs, Schools Division Office of Isabela City, Basilan.
// Same list as SwiSS (src/renderer/utils/schools.js), sourced from
// https://www.depedisabelacity.org/ district pages. id is null where DepEd has
// not published one yet.
export const DIVISION_SCHOOLS = [
  { id: "126018", name: "Badjao Floating Integrated School" },
  { id: "314603", name: "Baluno National High School" },
  { id: "303894", name: "Basilan National High School" },
  { id: "314602", name: "Basilan National High School - Night" },
  { id: "126006", name: "Simeon & Josefa Obsequio Elementary School" },
  { id: "126005", name: "Begang Central Elementary School" },
  { id: "303897", name: "Begang National High School" },
  { id: "198006", name: "Bishop Querexeta Elementary School" },
  { id: "126027", name: "Busay Elementary School" },
  { id: "126028", name: "Cabunbata Elementary School" },
  { id: "126029", name: "Calvario Elementary School" },
  { id: "126007", name: "Calvario Peak Elementary School" },
  { id: "303896", name: "Calvario Peak National High School" },
  { id: "126030", name: "Campo Barn Elementary School" },
  { id: "133031", name: "Caro Elementary School" },
  { id: "305550", name: "Caro National High School" },
  { id: "126019", name: "Diki Elementary School" },
  { id: "500243", name: "Geras Integrated School - Elementary" },
  { id: "314604", name: "Geras Integrated School - Secondary" },
  { id: "112765", name: "Hadji Camlani Elementary School" },
  { id: "198014", name: "Hadji Maulana Primary School" },
  { id: "198007", name: "Hadji Amilhamja Lahaba Memorial Elementary School" },
  { id: "126001", name: "Isabela East Central Elementary School" },
  { id: "126000", name: "Isabela Bliss Elementary School" },
  { id: "126002", name: "Isabela Central Pilot Elementary School" },
  { id: "198010", name: "Isabela Central Pilot Elementary School - Night" },
  { id: "314601", name: "Isabela City National High School" },
  { id: "198015", name: "Ismael Integrated School - Elementary" },
  { id: "501905", name: "Ismael Integrated School - Secondary" },
  { id: "126020", name: "Kaumpurnah Elementary School" },
  { id: "126009", name: "Kauman Ekka Elementary School" },
  { id: "126008", name: "Kapatagan Diutay Elementary School" },
  { id: "126010", name: "Kawa-Kawa Elementary School" },
  { id: "126031", name: "Kumalarang Elementary School" },
  { id: "303899", name: "Kumalarang National High School" },
  { id: "126021", name: "Lampinigan Elementary School" },
  { id: "305549", name: "Lampinigan National High School" },
  { id: "126032", name: "Lanote Elementary School" },
  { id: "126011", name: "Latuan Elementary School" },
  { id: "126012", name: "Look-Jambangan Elementary School" },
  { id: "126022", name: "Lukbuton Elementary School" },
  { id: "126033", name: "Lunot Elementary School" },
  { id: "126034", name: "Maligue Elementary School" },
  { id: "126023", name: "Malamawi Central Elementary School" },
  { id: "303895", name: "Malamawi National High School" },
  { id: null, name: "Masula National High School" },
  { id: "126024", name: "Marang-Marang Elementary School" },
  { id: "198009", name: "Masola Elementary School" },
  { id: "198013", name: "NR Hugo Elementary School" },
  { id: "126035", name: "Old Camp Elementary School" },
  { id: "126013", name: "Palasanan Primary School" },
  { id: "126025", name: "Panigayan Integrated School" },
  { id: "126014", name: "Panunsulan Elementary School" },
  { id: "198016", name: "Ustadz Wahab Akbar Elementary School" },
  { id: "126016", name: "Spillway Elementary School" },
  { id: "126036", name: "Sumagdang Elementary School" },
  { id: "126003", name: "Sunset Elementary School" },
  { id: "126017", name: "Tabiawan Elementary School" },
  { id: "126026", name: "Tampalan Elementary School" },
  { id: "303898", name: "Tandung Ahas National High School" },
  { id: "198001", name: "Menzi Elementary School" },
  { id: "198002", name: "Balatanay Elementary School" },
  { id: "198003", name: "Makiri Elementary School" },
  { id: "198004", name: "Ajibon Elementary School" },
  { id: "198005", name: "Balawatin Elementary School" },
  { id: "198008", name: "MS Bernardo Elementary School" },
  { id: "126004", name: "Westside Elementary School" },
  { id: null, name: "Camp Salamat Primary School" },
];

// Loose key: case, punctuation and spacing ignored ("Marang Marang" = "Marang-Marang").
const schoolKey = (name) => String(name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// This app spells integrated-school campuses differently from the official list:
// "Geras Integrated School (High School)" is "Geras Integrated School - Secondary",
// and a single-campus school ("Panigayan Integrated School") has one ID for both.
function officialSpellings(name) {
  const trimmed = String(name || "").trim();
  const highSchool = /^(.*?)\s*\(High School\)$/i.exec(trimmed);
  if (highSchool) return [trimmed, `${highSchool[1]} - Secondary`, highSchool[1]];
  return [trimmed, `${trimmed} - Elementary`];
}

// "Begang Central Elementary School" -> "126005"; "" when unknown or pending.
export function officialSchoolId(name) {
  for (const spelling of officialSpellings(name)) {
    const match = DIVISION_SCHOOLS.find((school) => schoolKey(school.name) === schoolKey(spelling));
    if (match) return match.id || "";
  }
  return "";
}
