export const RELEASE_NOTES = {
  "1.0.8": {
  title: "v1.0.8",
  sections: [
    //{
     //heading: "✨ Improvements",
      //items: [
        //"Added 'Delete Entire Class' to bulk-remove all learners in a selected grade and section at once",
        //"Section filter now locks until a Grade Level is chosen first, preventing mixed-grade section lists",
        //"Section dropdown now lists sections in proper Kinder → Grade 6 order",
        //"Learner table now always sorts Male before Female, alphabetically by name",
        //"Learner table now scrolls within a fixed area with a sticky header and pinned Name column, so it's easier to browse large classes and always know whose row you're viewing",
      //],
    //},
    {
      heading: "🛠 Fixes",
      items: [
        "SDO Dashboard now shows all cards, graphs, and the grade-level table with zero values for schools that haven't submitted records yet, instead of hiding everything behind a blank 'No data available' screen.",
        "Logging out now resets the selected school, dashboard school, and reports school back to their defaults (ALL SCHOOLS / CONSOLIDATED), so the next user who logs in no longer sees the previous user's last-selected school",
      ],
    },
  ],
},
  
};