import React, { useState, useEffect, useMemo } from "react";

// ─── Local Image Import ────────────────────────────────────────────────────
import swabeLogo from "../images/swabe.png";

// Supabase client
import { supabase } from "../utils/supabaseClient";

import { SCHOOL_YEARS } from "../utils/bmi";
import { SCHOOL_OPTIONS } from "../utils/schools";
import { getSchoolLogoUrl } from "../utils/schoolLogoMap";
import { getCachedLogoSrc, useLogoCacheHydrated } from "../utils/logoCache";
import { exportImmunizationExcel } from "../utils/exportImmunizationExcel";
import "./Immunization.css";

// ─── Default District Options (Fallback Options) ───────────────────────────
const DISTRICT_OPTIONS = [
  "East District I",
  "East District II",
  "West District I",
  "West District II",
  "West District III",
  "North District I",
  "North District II",
  "North District III",
  "Island District I",
  "Island District II",
  "Island District III",
];

// ─── Default Hardcoded Regions Fallback ────────────────────────────────────
const DEFAULT_REGIONS = [
  { code: "090000000", name: "Zamboanga Peninsula", regionName: "Region IX" },
  { code: "130000000", name: "NCR", regionName: "National Capital Region" },
  {
    code: "140000000",
    name: "CAR",
    regionName: "Cordillera Administrative Region",
  },
  { code: "010000000", name: "Ilocos Region", regionName: "Region I" },
  { code: "020000000", name: "Cagayan Valley", regionName: "Region II" },
  { code: "030000000", name: "Central Luzon", regionName: "Region III" },
  { code: "040000000", name: "CALABARZON", regionName: "Region IV-A" },
  { code: "170000000", name: "MIMAROPA Region", regionName: "MIMAROPA" },
  { code: "050000000", name: "Bicol Region", regionName: "Region V" },
  { code: "060000000", name: "Western Visayas", regionName: "Region VI" },
  { code: "070000000", name: "Central Visayas", regionName: "Region VII" },
  { code: "080000000", name: "Eastern Visayas", regionName: "Region VIII" },
  { code: "100000000", name: "Northern Mindanao", regionName: "Region X" },
  { code: "110000000", name: "Davao Region", regionName: "Region XI" },
  { code: "120000000", name: "SOCCSKSARGEN", regionName: "Region XII" },
  { code: "160000000", name: "Caraga", regionName: "Region XIII" },
  {
    code: "190000000",
    name: "BARMM",
    regionName: "Bangsamoro Autonomous Region in Muslim Mindanao",
  },
];

const ISABELA_CITY_BARANGAYS_FALLBACK = [
  "Aguada",
  "Balatanay",
  "Baluno",
  "Begang",
  "Binuangan",
  "Busay",
  "Cabunbata",
  "Calvario",
  "Carbon",
  "Diki",
  "Doña Ramona T. Alano",
  "Isabela Eastside",
  "Isabela Proper",
  "Kapatagan Grande",
  "Kapayawan",
  "Kaumpurnah Zone I",
  "Kaumpurnah Zone II",
  "Kaumpurnah Zone III",
  "Kumalarang",
  "La Piedad",
  "Lampinigan",
  "Lanote",
  "Lukbuton",
  "Lumbang",
  "Makiri",
  "Maligue",
  "Marang-marang",
  "Marketsite",
  "Masula",
  "Menzi",
  "Panigayan",
  "Panunsulan",
  "Port Area",
  "Riverside",
  "San Rafael",
  "Santa Barbara",
  "Santa Cruz",
  "Seaside",
  "Small Kapatagan",
  "Sumagdang",
  "Sunrise Village",
  "Tabiawan",
  "Tabuk",
  "Tampalan",
  "Timpul",
];

// ─── IndexedDB Local Caching Utilities ─────────────────────────────────────
const DB_NAME = "swabe_psgc_offline_db";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("locations")) {
        db.createObjectStore("locations");
      }
      if (!db.objectStoreNames.contains("school_info_sbmi")) {
        db.createObjectStore("school_info_sbmi", { keyPath: "id" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e);
  });
}

async function getCachedPsgc(key) {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction("locations", "readonly");
      const store = tx.objectStore("locations");
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCachedPsgc(key, value) {
  try {
    const db = await openDatabase();
    const tx = db.transaction("locations", "readwrite");
    const store = tx.objectStore("locations");
    store.put(value, key);
  } catch (err) {
    console.warn("IndexedDB write error:", err);
  }
}

async function saveLocalSbmi(record) {
  try {
    const db = await openDatabase();
    const tx = db.transaction("school_info_sbmi", "readwrite");
    const store = tx.objectStore("school_info_sbmi");
    store.put(record);
  } catch (err) {
    console.warn("Local SQLite/IndexedDB save error:", err);
  }
}

async function getPsgcData(endpoint, cacheKey) {
  const cached = await getCachedPsgc(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  if (navigator.onLine) {
    try {
      const response = await fetch(`https://psgc.gitlab.io/api/${endpoint}`);
      if (response.ok) {
        const data = await response.json();
        await setCachedPsgc(cacheKey, data);
        return data;
      }
    } catch (err) {
      console.warn(`Online fetch failed for ${endpoint}:`, err);
    }
  }
  return [];
}

const VACCINE_PROGRAMS = {
  "MR & Td": {
    label: "MR & Td (Grade 1 — Male & Female)",
    gradeLevel: "Grade 1",
    formTitle: "Recording Form 1: Masterlist of Grade 1 Students",
    infoBanner:
      "💉 Grade 1 — All Students (Male & Female) for Measles-Rubella (MR) & Tetanus-diphtheria (Td).",
    sexFilter: () => true,
    vax1Label: "MR",
    vax2Label: "Td",
  },
  HPV: {
    label: "HPV (Grade 4 — Female Only)",
    gradeLevel: "Grade 4",
    formTitle: "Recording Form 3: Masterlist of Grade 4 Female Students",
    infoBanner:
      "💉 Grade 4 — Female Students Only per DepEd/DOH SBI guidelines (Human Papillomavirus - HPV).",
    sexFilter: (student) => {
      const sex = (student?.sex || "").toUpperCase();
      return sex === "F" || sex === "FEMALE";
    },
    vax1Label: "HPV Dose 1",
    vax2Label: "HPV Dose 2",
  },
};

const ELEMENTARY_SCHOOLS = SCHOOL_OPTIONS.filter((s) => {
  const u = s.toUpperCase();
  return (
    s !== "ALL SCHOOLS" &&
    !u.includes("HIGH SCHOOL") &&
    !u.includes("NATIONAL HIGH") &&
    !u.includes("NHS") &&
    !u.includes("(HIGH SCHOOL)")
  );
}).sort((a, b) => a.localeCompare(b));

function getDefaultSchoolYear() {
  if (!SCHOOL_YEARS || SCHOOL_YEARS.length === 0) return "";
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const targetStartYear = month >= 5 ? year : year - 1;
  return (
    SCHOOL_YEARS.find((sy) => sy.includes(String(targetStartYear))) ||
    SCHOOL_YEARS[0] ||
    ""
  );
}

function calculateAge(dobStr) {
  if (!dobStr) return "";
  const birthDate = new Date(dobStr);
  if (isNaN(birthDate.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 ? age : "";
}

function matchesGrade(student, targetGrade) {
  if (!student) return false;
  const sGrade = (student.gradeLevel || student.grade || "").trim();
  if (sGrade) {
    return sGrade.toLowerCase() === targetGrade.toLowerCase();
  }
  const sSection = (student.section || "").trim();
  const sg = sSection.split(" - ")[0];
  return sg.toLowerCase() === targetGrade.toLowerCase();
}

function blankRow(id) {
  return {
    id,
    no: "",
    name: "",
    address: "",
    dob: "",
    age: "",
    sex: "",
    consentY: "",
    consentN: "",
    allergies: "",
    sickY: "",
    sickN: "",
    vax1: "",
    vax1Lot: "",
    vax2: "",
    vax2Lot: "",
    deferral: "",
    refusal: "",
    reasons: "",
  };
}

function makeBlankRows(count, startId = 1) {
  return Array.from({ length: count }, (_, i) => blankRow(startId + i));
}

function sortStudents(arr) {
  return [...arr].sort((a, b) => {
    const secA = (a.section || "").toLowerCase();
    const secB = (b.section || "").toLowerCase();
    if (secA < secB) return -1;
    if (secA > secB) return 1;

    const isMaleA = (a.sex || "").toUpperCase().startsWith("M") ? 0 : 1;
    const isMaleB = (b.sex || "").toUpperCase().startsWith("M") ? 0 : 1;
    if (isMaleA !== isMaleB) return isMaleA - isMaleB;

    return (a.name || "").localeCompare(b.name || "");
  });
}

function formatDob(birthdate) {
  if (!birthdate) return "";
  const m = String(birthdate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return String(birthdate);
}

export default function Immunization({
  students = [],
  allSchoolsData = {},
  onBack,
}) {
  useLogoCacheHydrated();

  const [selectedProgramKey, setSelectedProgramKey] = useState("MR & Td");
  const [selectedSchool, setSelectedSchool] = useState("");
  const [sy, setSy] = useState(getDefaultSchoolYear);
  const [section, setSection] = useState("All");

  const [rows, setRows] = useState([]);
  const [schoolName, setSchoolName] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [vaccinator1, setVaccinator1] = useState("");
  const [vaccinator2, setVaccinator2] = useState("");

  // ─── Cascading Location State ─────────────────────────────────────────────
  const [regionsList, setRegionsList] = useState(DEFAULT_REGIONS);
  const [provincesList, setProvincesList] = useState([]);
  const [citiesList, setCitiesList] = useState([]);
  const [barangaysList, setBarangaysList] = useState([]);

  const [selectedRegionCode, setSelectedRegionCode] = useState("090000000"); // Region IX
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedCityCode, setSelectedCityCode] = useState("Isabela City");
  const [selectedBarangay, setSelectedBarangay] = useState("");

  const [district, setDistrict] = useState("");
  const [vaxDate, setVaxDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );

  // Save Status
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Vial inventory trackers
  const [vax1Received, setVax1Received] = useState("");
  const [vax1Used, setVax1Used] = useState("");
  const [vax1Unused, setVax1Unused] = useState("");

  const [vax2Received, setVax2Received] = useState("");
  const [vax2Used, setVax2Used] = useState("");
  const [vax2Unused, setVax2Unused] = useState("");

  const activeProgram =
    VACCINE_PROGRAMS[selectedProgramKey] || VACCINE_PROGRAMS["MR & Td"];
  const targetGrade = activeProgram.gradeLevel;

  // ─── Dynamic School Lookup ────────────────────────────────────────────────
  useEffect(() => {
    async function fetchSchoolDistrict() {
      if (!selectedSchool) {
        setSchoolName("Division-wide (All Schools)");
        setDistrict("");
        return;
      }

      setSchoolName(selectedSchool);

      try {
        let schoolData = null;

        if (window.electron?.ipcRenderer) {
          schoolData = await window.electron.ipcRenderer.invoke(
            "get-school-by-name",
            selectedSchool.trim(),
          );
        }

        if (!schoolData && navigator.onLine && supabase) {
          const { data } = await supabase
            .from("schools")
            .select("*")
            .eq("name", selectedSchool.trim())
            .maybeSingle();
          schoolData = data;
        }

        if (schoolData && schoolData.district) {
          setDistrict(schoolData.district);
        } else {
          setDistrict("");
        }
      } catch (err) {
        console.error("Error looking up school district:", err);
      }
    }

    fetchSchoolDistrict();
  }, [selectedSchool]);

  // ─── Load Regions On Mount ────────────────────────────────────────────────
  useEffect(() => {
    async function loadRegions() {
      const data = await getPsgcData("regions.json", "psgc_regions");
      if (data && data.length > 0) {
        setRegionsList(data);
      }
    }
    loadRegions();
  }, []);

  // ─── Cascade: Region -> Provinces & Cities ───────────────────────────────
  useEffect(() => {
    if (!selectedRegionCode) {
      setProvincesList([]);
      setCitiesList([]);
      return;
    }

    async function loadRegionLocations() {
      let provs = await getPsgcData(
        `regions/${selectedRegionCode}/provinces.json`,
        `provinces_${selectedRegionCode}`,
      );

      let regionCities = await getPsgcData(
        `regions/${selectedRegionCode}/cities-municipalities.json`,
        `cities_${selectedRegionCode}`,
      );

      if (selectedRegionCode === "090000000") {
        const isabelaExists = (regionCities || []).some((c) =>
          (c.name || "").toLowerCase().includes("isabela"),
        );
        if (!isabelaExists) {
          regionCities = [
            { code: "090702000", name: "Isabela City" },
            { code: "097332000", name: "Zamboanga City" },
            ...(regionCities || []),
          ];
        }
      }

      setProvincesList(provs || []);
      setCitiesList(regionCities || []);
    }

    loadRegionLocations();
  }, [selectedRegionCode]);

  // ─── Cascade: Province -> Cities/Municipalities ─────────────────────────
  useEffect(() => {
    if (!selectedProvinceCode) return;

    async function loadProvinceCities() {
      const data = await getPsgcData(
        `provinces/${selectedProvinceCode}/cities-municipalities.json`,
        `cities_prov_${selectedProvinceCode}`,
      );
      if (data && data.length > 0) {
        setCitiesList(data);
      }
    }

    loadProvinceCities();
  }, [selectedProvinceCode]);

  // ─── Cascade: City -> Barangays ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedCityCode) {
      setBarangaysList([]);
      return;
    }

    if (
      selectedCityCode === "Isabela City" ||
      selectedCityCode === "090702000"
    ) {
      setBarangaysList(
        ISABELA_CITY_BARANGAYS_FALLBACK.map((b) => ({ name: b })),
      );
      return;
    }

    async function loadBarangays() {
      const data = await getPsgcData(
        `cities-municipalities/${selectedCityCode}/barangays.json`,
        `barangays_${selectedCityCode}`,
      );
      if (data && data.length > 0) {
        setBarangaysList(data);
      } else {
        setBarangaysList([]);
      }
    }

    loadBarangays();
  }, [selectedCityCode]);

  // ─── Excel Export Function ────────────────────────────────────────────────
  const handleDownloadExcel = async () => {
    const selectedRegionObj = regionsList.find(
      (r) => r.code === selectedRegionCode,
    );
    const regionNameStr = selectedRegionObj
      ? selectedRegionObj.regionName || selectedRegionObj.name
      : selectedRegionCode || "Region IX";

    // Pass the active student row data directly into 'students'
    const filledRows = rows.filter((r) => r.name && r.name.trim() !== "");

    await exportImmunizationExcel({
      students: filledRows,
      selectedSchool: schoolName || selectedSchool || "CONSOLIDATED",
      sy: sy,
      selectedProgramKey: selectedProgramKey,
      activeProgram: activeProgram,
      section: section === "All" ? targetGrade : section,
      region: regionNameStr,
      province: selectedProvinceCode || "N/A",
      city: selectedCityCode,
      barangay: selectedBarangay,
      district: district,
      vaxDate: vaxDate,
      vax1Received: vax1Received,
      vax1Used: vax1Used,
      vax1Unused: vax1Unused,
      vax2Received: vax2Received,
      vax2Used: vax2Used,
      vax2Unused: vax2Unused,
      metadata: {
        title: activeProgram.formTitle,
        schoolName: schoolName || selectedSchool,
      },
    });
  };

  // ─── Save to SQLite & Supabase table school_info_sbmi ────────────────────
  async function handleSaveFormData() {
    setIsSaving(true);
    setSaveMessage("Saving form data...");

    const selectedRegionObj = regionsList.find(
      (r) => r.code === selectedRegionCode,
    );
    const regionNameStr = selectedRegionObj
      ? selectedRegionObj.regionName || selectedRegionObj.name
      : selectedRegionCode;

    const payload = {
      id: `${schoolName}_${sy}_${selectedProgramKey}_${Date.now()}`.replace(
        /\s+/g,
        "_",
      ),
      school_name: schoolName,
      school_year: sy,
      vaccine_program: selectedProgramKey,
      section: section === "All" ? targetGrade : section,
      region: regionNameStr,
      province: selectedProvinceCode || "N/A",
      city_municipality: selectedCityCode,
      barangay: selectedBarangay,
      district: district,
      vaccination_date: vaxDate,
      supervisor: supervisor,
      vaccinator_1: vaccinator1,
      vaccinator_2: vaccinator2,
      vax1_received: vax1Received,
      vax1_used: vax1Used,
      vax1_unused: vax1Unused,
      vax2_received: vax2Received,
      vax2_used: vax2Used,
      vax2_unused: vax2Unused,
      student_rows: JSON.stringify(rows.filter((r) => r.name.trim() !== "")),
      created_at: new Date().toISOString(),
    };

    // 1. Save Locally
    await saveLocalSbmi(payload);

    // 2. Save Online to Supabase
    let supabaseSuccess = false;
    if (supabase) {
      try {
        const { error } = await supabase
          .from("school_info_sbmi")
          .upsert([payload]);

        if (!error) {
          supabaseSuccess = true;
        } else {
          console.warn("Supabase save warning:", error);
        }
      } catch (e) {
        console.warn("Supabase network error:", e);
      }
    }

    setIsSaving(false);
    if (supabaseSuccess) {
      setSaveMessage("✅ Saved to Local DB & Supabase cloud!");
    } else {
      setSaveMessage("✅ Saved locally to SQLite/IndexedDB (Offline)");
    }

    setTimeout(() => setSaveMessage(""), 4000);
  }

  // ─── Dynamic HTML Generation for Print / Preview ─────────────────────────
  const generateImmunizationHtml = () => {
    const selectedRegionObj = regionsList.find(
      (r) => r.code === selectedRegionCode,
    );
    const regionNameStr = selectedRegionObj
      ? selectedRegionObj.regionName || selectedRegionObj.name
      : selectedRegionCode || "Region IX";

    const displayRows = rows.length > 0 ? rows : makeBlankRows(25);

    const tableRowsHtml = displayRows
      .map(
        (r, idx) => `
        <tr style="height: 22px; background-color: ${idx % 2 === 1 ? "#fafafa" : "#ffffff"};">
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.no || ""}</td>
          <td style="border: 1px solid #000; font-size: 9px; padding: 2px 4px; font-weight: bold;">${r.name || ""}</td>
          <td style="border: 1px solid #000; font-size: 9px; padding: 2px 4px;">${r.address || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.dob || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.age ?? ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.sex || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.consentY || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.consentN || ""}</td>
          <td style="border: 1px solid #000; font-size: 9px; padding: 2px 4px;">${r.allergies || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.sickY || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.sickN || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.vax1 || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.vax1Lot || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.vax2 || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.vax2Lot || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.deferral || ""}</td>
          <td style="border: 1px solid #000; text-align: center; font-size: 9px; padding: 2px;">${r.refusal || ""}</td>
          <td style="border: 1px solid #000; font-size: 9px; padding: 2px 4px;">${r.reasons || ""}</td>
        </tr>`,
      )
      .join("");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${activeProgram.formTitle}</title>
        <style>
          @page {
            size: legal landscape;
            margin: 6mm;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 8px;
            color: #000;
            background: #fff;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .header-flex {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
          }
          .seal-img {
            width: 80px;
            height: 80px;
            object-fit: contain;
          }
          .title-box {
            text-align: center;
            flex: 1;
          }
          .title-main {
            font-size: 16px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .title-sub {
            font-size: 13px;
            font-weight: 700;
            margin-top: 2px;
          }
          .grid-container {
            display: grid;
            grid-template-columns: 1.3fr 1.4fr 1.3fr;
            gap: 14px;
            font-size: 10.5px;
            margin-bottom: 12px;
            padding-bottom: 6px;
          }
          .grid-col {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .field-row {
            display: flex;
            align-items: baseline;
            gap: 4px;
          }
          .field-label {
            font-weight: bold;
            white-space: nowrap;
          }
          .field-val {
            border-bottom: 1px solid #000;
            flex: 1;
            padding-left: 4px;
            min-height: 14px;
          }
          .vax-header {
            font-weight: bold;
            margin-bottom: 2px;
          }
          .vials-row {
            display: flex;
            gap: 16px;
          }
          .vial-group {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          table.imm-print-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
            border: 1px solid #000;
            table-layout: fixed;
          }
          table.imm-print-table th {
            border: 1px solid #000;
            background-color: #c2d69b !important;
            padding: 4px 2px;
            text-align: center;
            font-weight: bold;
            -webkit-print-color-adjust: exact;
          }
          table.imm-print-table th.banner {
            background-color: #f4f8f3 !important;
            font-style: italic;
            font-weight: normal;
            text-align: left;
            padding: 4px 8px;
            -webkit-print-color-adjust: exact;
          }
          .sig-container {
            display: flex;
            justify-content: space-between;
            margin-top: 35px;
            gap: 20px;
          }
          .sig-box {
            flex: 1;
            text-align: center;
          }
          .sig-name {
            font-weight: bold;
            font-size: 11px;
            min-height: 16px;
          }
          .sig-line {
            border-bottom: 1px solid #000;
            margin-top: 2px;
            margin-bottom: 4px;
          }
          .sig-title {
            font-size: 10px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="header-flex">
          <img src="${activeSchoolLogoUrl}" class="seal-img" />
          <div class="title-box">
            <div class="title-main">DEPARTMENT OF EDUCATION</div>
            <div class="title-main">SCHOOL-BASED IMMUNIZATION</div>
            <div class="title-sub">${activeProgram.formTitle}</div>
          </div>
          <img src="${rightSealUrl}" class="seal-img" />
        </div>

        <div class="grid-container">
          <div class="grid-col">
            <div class="field-row"><span class="field-label">Region:</span> <span class="field-val">${regionNameStr}</span></div>
            ${provincesList.length > 0 ? `<div class="field-row"><span class="field-label">Province:</span> <span class="field-val">${selectedProvinceCode || "N/A"}</span></div>` : ""}
            <div class="field-row"><span class="field-label">City/Municipality:</span> <span class="field-val">${selectedCityCode || "N/A"}</span></div>
            <div class="field-row"><span class="field-label">Barangay:</span> <span class="field-val">${selectedBarangay || "N/A"}</span></div>
          </div>

          <div class="grid-col">
            <div class="field-row"><span class="field-label">Name of School:</span> <span class="field-val">${schoolName || "N/A"}</span></div>
            <div class="field-row"><span class="field-label">Section:</span> <span class="field-val">${section === "All" ? targetGrade : section}</span></div>
            <div class="field-row"><span class="field-label">District/Municipality:</span> <span class="field-val">${district || "N/A"}</span></div>
            <div class="field-row"><span class="field-label">Date:</span> <span class="field-val">${vaxDate || "N/A"}</span></div>
          </div>

          <div class="grid-col">
            <div class="vials-row">
              <div class="vial-group">
                <div class="vax-header">${activeProgram.vax1Label}:</div>
                <div class="field-row"><span class="field-label">Received (in vials):</span> <span class="field-val">${vax1Received || ""}</span></div>
                <div class="field-row"><span class="field-label">Used (in vials):</span> <span class="field-val">${vax1Used || ""}</span></div>
                <div class="field-row"><span class="field-label">Unused (in vials):</span> <span class="field-val">${vax1Unused || ""}</span></div>
              </div>
              <div class="vial-group">
                <div class="vax-header">${activeProgram.vax2Label}:</div>
                <div class="field-row"><span class="field-label">Received (in vials):</span> <span class="field-val">${vax2Received || ""}</span></div>
                <div class="field-row"><span class="field-label">Used (in vials):</span> <span class="field-val">${vax2Used || ""}</span></div>
                <div class="field-row"><span class="field-label">Unused (in vials):</span> <span class="field-val">${vax2Unused || ""}</span></div>
              </div>
            </div>
          </div>
        </div>

        <table class="imm-print-table">
          <colgroup>
            <col style="width:32px">
            <col style="width:160px">
            <col style="width:110px">
            <col style="width:68px">
            <col style="width:28px">
            <col style="width:28px">
            <col style="width:24px">
            <col style="width:24px">
            <col style="width:85px">
            <col style="width:24px">
            <col style="width:24px">
            <col style="width:50px">
            <col style="width:65px">
            <col style="width:50px">
            <col style="width:65px">
            <col style="width:45px">
            <col style="width:45px">
            <col style="width:85px">
          </colgroup>
          <thead>
            <tr>
              <th colspan="18" class="banner">To be filled out by Local Health Center / Vaccination Team</th>
            </tr>
            <tr>
              <th rowspan="2">No.</th>
              <th rowspan="2">Name <br><span style="font-weight:normal; font-size:8px;">(Surname, First Name, MI)</span></th>
              <th rowspan="2">Complete Address</th>
              <th rowspan="2">Date of Birth</th>
              <th rowspan="2">Age</th>
              <th rowspan="2">Sex</th>
              <th colspan="2">Consent Slip</th>
              <th rowspan="2">History of Allergies</th>
              <th colspan="2">Sick today?</th>
              <th colspan="4">Vaccine Given</th>
              <th rowspan="2">Deferral</th>
              <th rowspan="2">Refusal</th>
              <th rowspan="2">Reasons</th>
            </tr>
            <tr>
              <th>Y</th>
              <th>N</th>
              <th>Y</th>
              <th>N</th>
              <th>${activeProgram.vax1Label}</th>
              <th>Lot/Batch No.</th>
              <th>${activeProgram.vax2Label}</th>
              <th>Lot/Batch No.</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div class="sig-container">
          <div class="sig-box">
            <div class="sig-name">${supervisor || ""}</div>
            <div class="sig-line"></div>
            <div class="sig-title">Name &amp; Signature of Supervisor</div>
          </div>
          <div class="sig-box">
            <div class="sig-name">${vaccinator1 || ""}</div>
            <div class="sig-line"></div>
            <div class="sig-title">Name &amp; Signature of Vaccinator 1</div>
          </div>
          <div class="sig-box">
            <div class="sig-name">${vaccinator2 || ""}</div>
            <div class="sig-line"></div>
            <div class="sig-title">Name &amp; Signature of Vaccinator 2</div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  // ─── Print Preview Handler ───────────────────────────────────────────────
  function handlePdfPreview() {
    const fullHtml = generateImmunizationHtml();

    const payload = {
      reportType: "immunization",
      html: fullHtml,
      title: activeProgram.formTitle,
      pageSize: "legal",
      orientation: "landscape",
    };

    if (window.electronAPI?.generatePrintPreview) {
      window.electronAPI.generatePrintPreview(payload);
      return;
    }

    const printWin = window.open("", "_blank");
    if (printWin) {
      printWin.document.write(fullHtml);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => printWin.print(), 300);
    } else {
      window.print();
    }
  }

  // ─── Logo Resolution ──────────────────────────────────────────────────────
  const activeSchoolLogoUrl = selectedSchool
    ? getCachedLogoSrc(selectedSchool) ||
      getSchoolLogoUrl(selectedSchool) ||
      swabeLogo
    : swabeLogo;

  const rightSealUrl =
    getCachedLogoSrc("__SDO__") || getCachedLogoSrc("sdo") || swabeLogo;

  const schoolStudents = useMemo(() => {
    if (selectedSchool) {
      if (allSchoolsData && Object.keys(allSchoolsData).length > 0) {
        return allSchoolsData[selectedSchool] || [];
      }
      return students.filter(
        (s) => (s.schoolName || s.school_name || "") === selectedSchool,
      );
    }
    if (allSchoolsData && Object.keys(allSchoolsData).length > 0) {
      return Object.values(allSchoolsData).flat();
    }
    return students;
  }, [selectedSchool, students, allSchoolsData]);

  const availableSections = useMemo(() => {
    return [
      ...new Set(
        schoolStudents
          .filter((s) => matchesGrade(s, targetGrade))
          .map((s) => s.section)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [schoolStudents, targetGrade]);

  useEffect(() => {
    setSection("All");
  }, [selectedProgramKey, selectedSchool]);

  useEffect(() => {
    const filtered = schoolStudents.filter((s) => {
      const matchGrade = matchesGrade(s, targetGrade);
      const matchSection = section === "All" || s.section === section;
      const matchSex = activeProgram.sexFilter(s);
      return matchGrade && matchSection && matchSex;
    });

    const sorted = sortStudents(filtered);

    const filled = sorted.map((s, idx) => {
      const formattedDob = formatDob(s.birthdate);
      const computedAge = calculateAge(s.birthdate);
      const sexVal = (s.sex || "").toUpperCase().startsWith("M")
        ? "M"
        : (s.sex || "").toUpperCase().startsWith("F")
          ? "F"
          : s.sex || "";

      return {
        ...blankRow(idx + 1),
        no: idx + 1,
        name: s.name || "",
        address: s.address || "",
        dob: formattedDob,
        age: computedAge,
        sex: sexVal,
      };
    });

    const minimumRows = Math.max(filled.length, 25);
    const extraRows =
      filled.length < minimumRows
        ? makeBlankRows(minimumRows - filled.length, filled.length + 1)
        : [];

    setRows([...filled, ...extraRows]);
  }, [selectedProgramKey, targetGrade, section, schoolStudents, activeProgram]);

  function updateRow(id, field, value) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  }

  function addRow() {
    setRows((prev) => {
      const newId = (prev[prev.length - 1]?.id || 0) + 1;
      return [...prev, { ...blankRow(newId), no: newId }];
    });
  }

  return (
    <div className="page immunization-page">
      {/* ── Top Header Bar ── */}
      <div className="page-header no-print">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-primary" onClick={onBack}>
            ← Back
          </button>
          <div>
            <h1 className="page-title">School Immunization Program</h1>
            <p className="page-sub">Recording Form — Learner Masterlist</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saveMessage && <span className="imm-save-badge">{saveMessage}</span>}

          {/* Download Excel Button */}
          <button
            type="button"
            className="btn btn-success"
            onClick={handleDownloadExcel}
            style={{
              height: "38px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "#16a34a",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              padding: "0 16px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            📊 Download Excel
          </button>

          {/* Save Form Data Button */}
          <button
            className="btn btn-primary"
            onClick={handleSaveFormData}
            disabled={isSaving}
          >
            💾 {isSaving ? "Saving..." : "Save Form Data"}
          </button>

          <button className="btn btn-primary" onClick={handlePdfPreview}>
            👁 Preview Report
          </button>
        </div>
      </div>

      {/* ── Filter Controls ── */}
      <div className="filter-row no-print">
        <div className="form-group">
          <label className="form-label">Vaccine Program</label>
          <select
            className="form-select"
            value={selectedProgramKey}
            onChange={(e) => setSelectedProgramKey(e.target.value)}
          >
            {Object.keys(VACCINE_PROGRAMS).map((key) => (
              <option key={key} value={key}>
                {VACCINE_PROGRAMS[key].label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">
            School ({ELEMENTARY_SCHOOLS.length} schools)
          </label>
          <select
            className="form-select"
            value={selectedSchool}
            onChange={(e) => setSelectedSchool(e.target.value)}
          >
            <option value="">
              All Schools ({ELEMENTARY_SCHOOLS.length}) — Division-wide
            </option>
            {ELEMENTARY_SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">School Year</label>
          <select
            className="form-select"
            value={sy}
            onChange={(e) => setSy(e.target.value)}
          >
            {(SCHOOL_YEARS || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Section</label>
          <select
            className="form-select"
            value={section}
            onChange={(e) => setSection(e.target.value)}
          >
            <option value="All">All Sections</option>
            {availableSections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="imm-info-banner no-print">{activeProgram.infoBanner}</div>

      {/* ── Printable Form Area ── */}
      <div className="imm-print-area">
        <div className="imm-republic-header">
          <div className="imm-seal-box">
            <img
              src={activeSchoolLogoUrl}
              alt="School Seal"
              className="imm-seal"
            />
          </div>

          <div className="imm-republic-center">
            <div className="imm-dept-title">DEPARTMENT OF EDUCATION</div>
            <div className="imm-dept-title">SCHOOL-BASED IMMUNIZATION</div>
            <div className="imm-form-title">{activeProgram.formTitle}</div>
          </div>

          <div className="imm-seal-box">
            <img src={rightSealUrl} alt="Division Seal" className="imm-seal" />
          </div>
        </div>

        {/* ── Official Header Grid ── */}
        <div className="imm-header-grid">
          {/* Column 1: Cascading PSGC Locations */}
          <div className="imm-grid-col">
            <div className="imm-grid-field">
              <span className="imm-grid-label">Region:</span>
              <select
                className="imm-grid-select"
                value={selectedRegionCode}
                onChange={(e) => {
                  setSelectedRegionCode(e.target.value);
                  setSelectedProvinceCode("");
                  setSelectedCityCode("");
                  setSelectedBarangay("");
                }}
              >
                <option value="">-- Select Region --</option>
                {regionsList.map((r) => (
                  <option key={r.code || r.name} value={r.code}>
                    {r.regionName ? `${r.regionName} - ${r.name}` : r.name}
                  </option>
                ))}
              </select>
            </div>

            {provincesList.length > 0 && (
              <div className="imm-grid-field">
                <span className="imm-grid-label">Province:</span>
                <select
                  className="imm-grid-select"
                  value={selectedProvinceCode}
                  onChange={(e) => {
                    setSelectedProvinceCode(e.target.value);
                    setSelectedCityCode("");
                    setSelectedBarangay("");
                  }}
                >
                  <option value="">-- Select Province --</option>
                  {provincesList.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="imm-grid-field">
              <span className="imm-grid-label">City/Municipality:</span>
              <select
                className="imm-grid-select"
                value={selectedCityCode}
                onChange={(e) => {
                  setSelectedCityCode(e.target.value);
                  setSelectedBarangay("");
                }}
              >
                <option value="">-- Select City / Municipality --</option>
                {citiesList.map((c) => (
                  <option key={c.code || c.name} value={c.code || c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="imm-grid-field">
              <span className="imm-grid-label">Barangay:</span>
              <select
                className="imm-grid-select"
                value={selectedBarangay}
                onChange={(e) => setSelectedBarangay(e.target.value)}
              >
                <option value="">-- Select Barangay --</option>
                {barangaysList.map((b) => (
                  <option key={b.code || b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Column 2: School Name, Section, Dynamic District, Date */}
          <div className="imm-grid-col">
            <div className="imm-grid-field">
              <span className="imm-grid-label">Name of School:</span>
              <input
                className="imm-grid-input"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
              />
            </div>
            <div className="imm-grid-field">
              <span className="imm-grid-label">Section:</span>
              <input
                className="imm-grid-input"
                value={section === "All" ? targetGrade : section}
                onChange={(e) => setSection(e.target.value)}
              />
            </div>
            <div className="imm-grid-field">
              <span className="imm-grid-label">District/Municipality:</span>
              <select
                className="imm-grid-select"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              >
                <option value="">-- Select District --</option>
                {district && !DISTRICT_OPTIONS.includes(district) && (
                  <option value={district}>{district}</option>
                )}
                {DISTRICT_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="imm-grid-field">
              <span className="imm-grid-label">Date:</span>
              <input
                type="date"
                className="imm-grid-input imm-grid-input--date"
                value={vaxDate}
                onChange={(e) => setVaxDate(e.target.value)}
              />
            </div>
          </div>

          {/* Column 3: Both vaccine inventories side by side */}
          <div className="imm-grid-col imm-grid-col--vials">
            <div className="imm-vials-row">
              <div className="imm-vial-group">
                <div className="imm-grid-vax-title">
                  {activeProgram.vax1Label}:
                </div>
                <div className="imm-grid-field">
                  <span className="imm-grid-label">Received (in vials):</span>
                  <input
                    className="imm-grid-input imm-grid-input--vial"
                    value={vax1Received}
                    onChange={(e) => setVax1Received(e.target.value)}
                  />
                </div>
                <div className="imm-grid-field">
                  <span className="imm-grid-label">Used (in vials):</span>
                  <input
                    className="imm-grid-input imm-grid-input--vial"
                    value={vax1Used}
                    onChange={(e) => setVax1Used(e.target.value)}
                  />
                </div>
                <div className="imm-grid-field">
                  <span className="imm-grid-label">Unused (in vials):</span>
                  <input
                    className="imm-grid-input imm-grid-input--vial"
                    value={vax1Unused}
                    onChange={(e) => setVax1Unused(e.target.value)}
                  />
                </div>
              </div>
              <div className="imm-vial-group">
                <div className="imm-grid-vax-title">
                  {activeProgram.vax2Label}:
                </div>
                <div className="imm-grid-field">
                  <span className="imm-grid-label">Received (in vials):</span>
                  <input
                    className="imm-grid-input imm-grid-input--vial"
                    value={vax2Received}
                    onChange={(e) => setVax2Received(e.target.value)}
                  />
                </div>
                <div className="imm-grid-field">
                  <span className="imm-grid-label">Used (in vials):</span>
                  <input
                    className="imm-grid-input imm-grid-input--vial"
                    value={vax2Used}
                    onChange={(e) => setVax2Used(e.target.value)}
                  />
                </div>
                <div className="imm-grid-field">
                  <span className="imm-grid-label">Unused (in vials):</span>
                  <input
                    className="imm-grid-input imm-grid-input--vial"
                    value={vax2Unused}
                    onChange={(e) => setVax2Unused(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Masterlist Table Section ── */}
        <div className="imm-table-wrapper">
          <table className="imm-table">
            <colgroup>
              <col style={{ width: "32px" }} />
              <col style={{ width: "160px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "68px" }} />
              <col style={{ width: "28px" }} />
              <col style={{ width: "28px" }} />
              <col style={{ width: "24px" }} />
              <col style={{ width: "24px" }} />
              <col style={{ width: "85px" }} />
              <col style={{ width: "24px" }} />
              <col style={{ width: "24px" }} />
              <col style={{ width: "50px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "50px" }} />
              <col style={{ width: "65px" }} />
              <col style={{ width: "45px" }} />
              <col style={{ width: "45px" }} />
              <col style={{ width: "85px" }} />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={18} className="imm-th-banner">
                  To be filled out by Local Health Center / Vaccination Team
                </th>
              </tr>
              <tr>
                <th rowSpan={2} className="imm-th imm-th--no">
                  No.
                </th>
                <th rowSpan={2} className="imm-th imm-th--name">
                  Name{" "}
                  <span className="imm-th-sub">(Surname, First Name, MI)</span>
                </th>
                <th rowSpan={2} className="imm-th imm-th--addr">
                  Complete Address
                </th>
                <th rowSpan={2} className="imm-th imm-th--dob">
                  Date of Birth
                </th>
                <th rowSpan={2} className="imm-th imm-th--age">
                  Age
                </th>
                <th rowSpan={2} className="imm-th imm-th--sex">
                  Sex
                </th>
                <th colSpan={2} className="imm-th">
                  Consent Slip
                </th>
                <th rowSpan={2} className="imm-th imm-th--allergies">
                  History of Allergies
                </th>
                <th colSpan={2} className="imm-th">
                  Sick today?
                </th>
                <th colSpan={4} className="imm-th">
                  Vaccine Given
                </th>
                <th rowSpan={2} className="imm-th imm-th--def">
                  Deferral
                </th>
                <th rowSpan={2} className="imm-th imm-th--ref">
                  Refusal
                </th>
                <th rowSpan={2} className="imm-th imm-th--reasons">
                  Reasons
                </th>
              </tr>
              <tr>
                <th className="imm-th imm-th--sub">Y</th>
                <th className="imm-th imm-th--sub">N</th>
                <th className="imm-th imm-th--sub">Y</th>
                <th className="imm-th imm-th--sub">N</th>
                <th className="imm-th imm-th--sub">
                  {activeProgram.vax1Label}
                </th>
                <th className="imm-th imm-th--sub">Lot/Batch No.</th>
                <th className="imm-th imm-th--sub">
                  {activeProgram.vax2Label}
                </th>
                <th className="imm-th imm-th--sub">Lot/Batch No.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="imm-tr">
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.no}
                      onChange={(e) => updateRow(row.id, "no", e.target.value)}
                    />
                  </td>
                  <td className="imm-td">
                    <input
                      className="imm-cell-input"
                      value={row.name}
                      onChange={(e) =>
                        updateRow(row.id, "name", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td">
                    <input
                      className="imm-cell-input"
                      value={row.address}
                      onChange={(e) =>
                        updateRow(row.id, "address", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.dob}
                      onChange={(e) => updateRow(row.id, "dob", e.target.value)}
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.age}
                      onChange={(e) => updateRow(row.id, "age", e.target.value)}
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.sex}
                      onChange={(e) => updateRow(row.id, "sex", e.target.value)}
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.consentY}
                      onChange={(e) =>
                        updateRow(row.id, "consentY", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.consentN}
                      onChange={(e) =>
                        updateRow(row.id, "consentN", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td">
                    <input
                      className="imm-cell-input"
                      value={row.allergies}
                      onChange={(e) =>
                        updateRow(row.id, "allergies", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.sickY}
                      onChange={(e) =>
                        updateRow(row.id, "sickY", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.sickN}
                      onChange={(e) =>
                        updateRow(row.id, "sickN", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.vax1}
                      onChange={(e) =>
                        updateRow(row.id, "vax1", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.vax1Lot}
                      onChange={(e) =>
                        updateRow(row.id, "vax1Lot", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.vax2}
                      onChange={(e) =>
                        updateRow(row.id, "vax2", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.vax2Lot}
                      onChange={(e) =>
                        updateRow(row.id, "vax2Lot", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.deferral}
                      onChange={(e) =>
                        updateRow(row.id, "deferral", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td imm-td--center">
                    <input
                      className="imm-cell-input imm-cell-input--center"
                      value={row.refusal}
                      onChange={(e) =>
                        updateRow(row.id, "refusal", e.target.value)
                      }
                    />
                  </td>
                  <td className="imm-td">
                    <input
                      className="imm-cell-input"
                      value={row.reasons}
                      onChange={(e) =>
                        updateRow(row.id, "reasons", e.target.value)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="no-print" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={addRow}>
            + Add Row
          </button>
        </div>

        {/* Signature Block */}
        <div className="imm-sig-block">
          <div className="imm-sig-col">
            <input
              className="imm-sig-input"
              value={supervisor}
              onChange={(e) => setSupervisor(e.target.value)}
            />
            <div className="imm-sig-line" />
            <div className="imm-sig-title">
              Name &amp; Signature of Supervisor
            </div>
          </div>
          <div className="imm-sig-col">
            <input
              className="imm-sig-input"
              value={vaccinator1}
              onChange={(e) => setVaccinator1(e.target.value)}
            />
            <div className="imm-sig-line" />
            <div className="imm-sig-title">
              Name &amp; Signature of Vaccinator 1
            </div>
          </div>
          <div className="imm-sig-col">
            <input
              className="imm-sig-input"
              value={vaccinator2}
              onChange={(e) => setVaccinator2(e.target.value)}
            />
            <div className="imm-sig-line" />
            <div className="imm-sig-title">
              Name &amp; Signature of Vaccinator 2
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
