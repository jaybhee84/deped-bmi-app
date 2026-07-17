export const RELEASE_NOTES = {
  "20.0.8": {
    title: "🎉 Welcome to Version 20.0.8",
    notes: [
      "Users can now be linked directly to a school.",
      "Multiple accounts can safely access the same school's data.",
      "School-based access is now managed through account binding.",
      "Dashboard automatically refreshes after school setup.",
      "Students, Reports, and SBFP pages update automatically.",
      "No restart or re-login required after binding a school.",
      "Multiple users assigned to the same school can access the same learner records.",
      "Data remains synchronized across school accounts.",
      "Clear School Settings now removes the school assignment.",
      "School data is removed from the current account.",
      "Dashboard and related pages immediately reset.",
      "Fixed cached student data appearing on newly created accounts.",
      "Fixed dashboard refresh issues after school binding.",
      "Fixed synchronization inconsistencies.",
      "Fixed stale school information after logout.",
      "Fixed school data not clearing when settings are removed.",
      "Improved login and startup data loading."
    ]
  },
  "20.0.9": {
    title: "🎉 Welcome to Version 20.0.9",
    notes: [
      "You can now sign in without internet, once you've signed in successfully online on this device before.",
      "Fixed sessions not staying signed in after closing and reopening the app.",
      "Fixed new accounts sometimes seeing another account's school or SBFP data on a shared device.",
      "Save Settings and Sign Out are now safe to use immediately, without waiting on background data to finish loading."
    ]
  },
  "20.0.10": {
    title: "🎉 Welcome to Version 20.0.10",
    notes: [
      "Clear School Settings now asks for confirmation before unlinking your account from a school.",
      "Fixed Clear School Settings not fully unlinking the account when offline — it now clearly tells you if the server-side unlink still needs to happen once you're back online.",
      "Fixed the offline sign-in reminder on the login screen displaying beside the login card instead of underneath it, which was also causing an unwanted scrollbar.",
      "Fixed Release Notes not appearing in Settings and Information for accounts running the latest version."
    ]
  },
  "20.0.11": {
    title: "🎉 Welcome to Version 20.0.11",
    notes: [
      "Filtered out all high schools from the SDO Dashboard registry, leaving only elementary and primary schools.",
      "Alphabetized the entire list of schools within the SDO Dashboard selection dropdown for easier navigation.",
      "Configured the 'ALL SCHOOLS' dashboard view to dynamically load the SDO logo (sdo.png) directly from the public 'school-logos' bucket in Supabase.",
      "Added zero-configuration URL extraction for the global SDO logo to prevent hardcoded Supabase domains and keep the asset routing robust.",
      "Implemented a smart fallback system for the SDO image loader to gracefully revert to the default school emoji if the logo asset fails to load."
    ]
  }
};