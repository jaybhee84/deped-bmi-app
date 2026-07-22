export const RELEASE_NOTES = {
  "1.1.0": {
  title: "v1.1.1",
  sections: [
    {
      heading: "✨ Improvements",
      items: [
        "macOS users now get a proper \"Update Available\" prompt when checking for updates, since the app isn't code-signed yet — Windows continues to update automatically in the background as before",
        "On macOS, clicking Check for Updates downloads the installer to your Downloads folder and opens it automatically so you can drag it into Applications",
        "School logos now load faster across the app thanks to a local on-device cache, so switching schools in the Division Dashboard no longer waits on a network fetch every time",
        "School logos are now available offline once they've been loaded on a device at least once",
      ],
    },
    {
      heading: "🛠 Fixes",
      items: [
        "Fixed the Check for Updates button silently doing nothing on macOS instead of reporting whether an update was found",
        "Fixed school logos sometimes failing to display on the Division Dashboard due to outdated storage access permissions",
        "Fixed school logos not matching the correct school after switching between schools in the Division view",
      ],
    },
  ],
},
  "1.0.9": {
  title: "v1.0.9",
  sections: [
    {
      heading: "✨ Improvements",
      items: [
        "UI and System Improvements for Better Experience"
      ],
    },
    {
      heading: "🛠 Fixes",
      items: [
        "Some Bugs fixed",
      ],
    },
  ],
},
  
};